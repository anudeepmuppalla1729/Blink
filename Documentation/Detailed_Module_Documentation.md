# Blink: Comprehensive Module & Architecture Documentation

This document provides a deep, pin-to-pin, and comprehensive explanation of every module in the **Blink** application. Blink is a local network, real-time chat application designed to allow users on the same Wi-Fi network to discover each other and establish secure Peer-to-Peer (P2P) connections for chatting and file sharing.

---

## 1. System Overview

At a high level, Blink operates using a **Hybrid Architecture**:
1. **Centralized Signaling & Presence (Server):** A Node.js backend tracks connected users, detects which users are on the same local network (via IP tracking), and acts as a middleman to relay WebRTC handshake signals.
2. **Decentralized Communication (Private Chat):** Once the handshake is complete, all private chat messages and file transfers happen entirely Peer-to-Peer (P2P) using WebRTC `RTCDataChannel`. The server is entirely bypassed during communication.
3. **Server-Relayed Communication (Group Chat):** Group chat messages and file chunks are relayed through the server via Socket.io to all members. This ensures stability and ease of discovery for multi-user sessions while remaining in-memory only.

---

## 2. Server (Backend) Modules

The server is built with **Node.js, Express, Socket.io**, and **MongoDB**. Its primary responsibilities are authentication and WebRTC signaling.

### 2.1. Server Entry Point (`server.js`)
This is the bootstrap file for the Node.js application.
- **Initialization:** It sets up an Express HTTP server and wraps it with `http.createServer()` to allow Socket.io to attach to the same port.
- **Middleware:** It configures `cors` for cross-origin requests, and `express.json` with a 10MB limit (primarily to accommodate base64 encoded user avatars during registration).
- **Database Connection:** Calls the MongoDB connection module (`src/config/db`).
- **Socket Integration:** Initializes the Socket.io `Server` instance with specific ping intervals to keep connections alive, and passes the instance to the `socketHandler.js` module.

### 2.2. Authentication Module (`authController.js`, `User.js`, `authRoutes.js`)
This module handles user identity. Because WebRTC connections are between specific users, identities must be validated.

- **Data Model (`User.js`):** A Mongoose schema that stores `name`, `username` (unique, lowercase), `email` (unique), `password` (hashed), and `avatar` (a compressed base64 string).
- **Registration (`register`):** 
  - Validates inputs.
  - Checks for duplicate emails or usernames.
  - Hashes the password using `bcrypt` (10 salt rounds).
  - Saves the base64 avatar directly to the database.
- **Login (`login`):**
  - Verifies the username and compares the hashed password.
  - If successful, generates a **JSON Web Token (JWT)** signed with a `JWT_SECRET`. This token is sent to the client and used to secure future requests.
- **Profile Update (`updateProfile`):** Allows users to update their name, avatar, or password.

### 2.3. WebSocket Signaling & Presence Engine (`socketHandler.js`)
This is the most crucial part of the backend. It determines *who* can see *whom* and helps them connect.

- **Connection & Authentication:** When a socket connects, a middleware extracts `userId`, `username`, `name`, and `avatar` from the socket's handshake authentication payload.
- **Presence Detection (IP Tracking):** 
  - The server extracts the user's IP address from `socket.handshake.headers['x-forwarded-for']` (if behind a proxy) or `socket.handshake.address`.
  - It maintains a global `connectedUsers` Map mapping `userId` -> `{ socketId, ip, ... }`.
  - **Magic Local Network Logic:** When a user connects, the server iterates through `connectedUsers` and finds all other users that have the **exact same IP address**. It then emits a `user_online` event to those specific peers, and sends the connecting user a `user_list`.
- **Signaling Relay:** WebRTC requires an exchange of "Offers", "Answers", and "ICE Candidates" before a P2P connection can be made. Because the peers don't know each other's local IP/Ports yet, they send these signals to the server via the `signal` event, which the server simply forwards to the target user's `socketId`.
- **Chat Requests:** Handles the flow of `send_request`, `accept_request`, and `reject_request` to ensure users mutually agree to open a WebRTC channel before signaling begins.
- **Group Chat Lifecycle:**
  - **Creation:** Any user can emit `create_group`, generating a unique `groupId`.
  - **Group Management:** The server stores an `activeGroups` Map containing group metadata, admin info, and a Map of currently connected members.
  - **Join Requests:** Users on the same IP can see groups and emit `request_join_group`. The server relays this to the group's admin for approval (`accept_group_join` / `reject_group_join`).
  - **Message & File Relay:** Unlike private chat, group data is emitted to the server and broadcast to all members. This includes chunked file relay (`group_file_start`, `group_file_chunk`).
  - **Auto-Cleanup:** If an admin disconnects, the group is automatically disbanded and all members are notified.

---

## 3. Client (Frontend) Modules

The client is built using **React** and **Vite**. It does not use any heavy UI frameworks, relying instead on custom Vanilla CSS for a premium "Claude-inspired" aesthetic.

### 3.1. Main Application State & UI (`App.jsx`)
The core orchestrator of the frontend experience.
- **State Management:** Uses custom hooks `useAuth` and `useSocket` to access global context. Manages local states for `activeUsers` (the presence list), `incomingRequest`, and `activeChatUser`.
- **Presence Sync:** Listens to Socket.io events (`user_list`, `user_online`, `user_offline`). When a user joins the network, they dynamically appear on the dashboard. If they leave, they are removed, and any active chats are cleanly closed.
- **Image Compression:** Before uploading avatars, `App.jsx` intercepts the image file and uses an HTML5 `<canvas>` element to compress it to a maximum of 250x250 pixels and lower JPEG quality. This ensures avatars do not bloat the MongoDB database.
- **UI Views:** Conditionally renders the Login/Register form, the Dashboard (showing nearby users), the Profile settings page, and the `ChatWindow` component.

### 3.2. WebRTC Peer-to-Peer Engine (`useWebRTC.js`)
This custom React hook is the networking brain of the client. It wraps the `simple-peer` library to establish and manage the WebRTC connection.

- **Initialization (`initiateConnection`):** When a user accepts a chat request, the "Initiator" creates a new `Peer`. This generates a WebRTC "Offer" signal, which is sent over Socket.io to the server.
- **Answering (`handleSignal`):** The receiving user gets the "Offer", creates a non-initiator `Peer`, and generates an "Answer" signal, which goes back through the server. Once exchanged, the P2P connection is established (`isConnected = true`).
- **Data Handling (`handleData`):** All messages arriving over the P2P channel are parsed from JSON. 
  - If it's a `text` message, it's pushed to the chat array.
  - If it's a file, it engages the custom Chunked File Transfer Protocol.
- **Chunked File Transfer Protocol:** 
  - WebRTC data channels have buffer limits (usually 16KB to 64KB). Sending a large image or video directly will crash the channel.
  - `useWebRTC.js` solves this by breaking files down.
  - **Sender:** Calculates `totalChunks` (file size / 16KB). Sends a `FILE_START` metadata packet (filename, type, total chunks). Then, uses `FileReader` to asynchronously read the file slice-by-slice, converts it to base64, and sends `FILE_CHUNK` packets with a small delay (`setTimeout(r, 5)`) to prevent buffer overflow.
  - **Receiver:** Detects `FILE_START` and creates a buffer array. As `FILE_CHUNK` packets arrive, they are placed in the correct index. A progress bar updates in the UI. Once all chunks arrive, the base64 chunks are stitched back together, converted to a `Uint8Array`, and transformed into a `Blob`. An Object URL is created so the user can download or view the file locally.

### 3.3. Global Context (`AuthContext.jsx`, `SocketContext.jsx`)
- **`AuthContext`:** Wraps the app. Manages the JWT token in `localStorage`. Provides `login`, `register`, `logout`, and `updateProfile` functions globally. Intercepts fetch requests to attach the `Authorization: Bearer <token>` header.
- **`SocketContext`:** Once a user is authenticated, this context initializes the `socket.io-client` connection. It passes the user's ID, username, and avatar in the `auth` payload so the server can identify them immediately upon connection.

### 3.4. Chat Interface (`ChatWindow.jsx`)
The UI component responsible for rendering the active P2P session.
- **Message Rendering:** Maps over the `messages` array passed down from `useWebRTC`. Distinguishes between text messages and files.
- **File Progress:** For incoming files, displays an animated progress bar based on the chunk reception percentage. For completed files, it renders images directly or provides a download link for other file types.
- **Auto-Scrolling:** Uses a `useRef` pointing to the bottom of the message list to automatically scroll down whenever a new message arrives.

### 3.5. Group Chat System (`GroupChatWindow.jsx`)
A specialized component for multi-user collaboration.
- **Admin Controls:** Only the creator (Admin) can see and respond to join requests, which appear as an inline notification bar within the chat interface.
- **Member Management:** Features a toggleable panel showing all current members with their avatars and status.
- **File Sharing:** Replicates the P2P chunking logic but relays data through the server using `group_file_start` and `group_file_chunk` events, ensuring all members receive the file stream simultaneously.
- **Isolation:** Group chat state (`groupMessages`, `activeGroup`) is kept entirely separate from the WebRTC private chat state to prevent data leakage.

---

## 4. Pin-to-Pin Workflows

### 4.1. The "Magic" Presence Workflow
1. User A (IP: 192.168.1.5) logs in. Socket connects. Server adds User A to `connectedUsers`. Server finds no one else with `192.168.1.5`.
2. User B (IP: 192.168.1.5) logs in on their phone. Socket connects. 
3. Server adds User B. Server searches `connectedUsers` for `192.168.1.5`. It finds User A.
4. Server emits `user_list: [User A]` to User B.
5. Server emits `user_online: User B` to User A.
6. User A and User B instantly see each other on their dashboards.

### 4.2. The Chat Handshake Workflow
1. User A clicks "Connect" on User B's profile. `socket.emit('send_request')`.
2. User B receives `receive_request`. A modal pops up. User B clicks "Accept". `socket.emit('accept_request')`.
3. User A receives `request_accepted` and calls `initiateConnection()`.
4. User A's WebRTC library generates an **Offer**. `socket.emit('signal', Offer)`.
5. Server relays Offer to User B.
6. User B's `useWebRTC` receives the Offer, generates an **Answer**. `socket.emit('signal', Answer)`.
7. Server relays Answer to User A. 
8. Both peers exchange **ICE Candidates** (network routing info) through the server.
9. WebRTC establishes a direct connection. `peer.on('connect')` fires.
10. The Server is no longer needed. All data now flows directly between User A and User B over the local router.

### 4.3. The Tear-Down Workflow
1. User A closes the chat window or the browser tab.
2. WebRTC connection breaks or `peer.destroy()` is called.
3. User B's `peer.on('close')` event fires instantly.
4. User B's UI cleans up the chat session and returns to the dashboard with a "Peer disconnected" toast notification.

---
*End of Documentation.*
