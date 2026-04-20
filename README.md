# Blink 📡

Blink is a modern, real-time local network chat application that allows users on the same Wi-Fi network to discover each other instantly and establish secure, peer-to-peer (P2P) connections for chatting and file sharing. 

It features a premium, minimalist "Claude-inspired" user interface, real-time presence detection, and robust profile management.

---

## 🏗 System Architecture

Blink is built on a modern JavaScript stack, divided into two primary modules: the **Client** and the **Server**.

### The Client (Frontend)
Built with **React** and powered by **Vite**, the frontend is responsible for the UI/UX and managing P2P WebRTC connections.
- **UI Framework:** Pure React with a custom Vanilla CSS design system (Tailwind removed).
- **State Management:** Utilizes React Context (`AuthContext`, `SocketContext`) for global state.
- **Networking:** WebSockets (`socket.io-client`) for signaling, and **WebRTC** for direct P2P data channels (chat and file transfers).

### The Server (Backend)
Built with **Node.js** and **Express**, the backend acts as an Authentication gateway, a Presence engine, and a Signaling Server for WebRTC.
- **Database:** MongoDB (via Mongoose) stores user profiles, encrypted passwords, and base64 avatars.
- **Authentication:** JWT (JSON Web Tokens) and bcrypt for secure login/registration.
- **Signaling & Presence:** **Socket.io** manages real-time "who is online" lists based on IP address tracking, and forwards WebRTC signaling data between peers.

---

## ⚙️ How the Modules Work Together

The magic of Blink happens through the interplay of WebSockets and WebRTC:

1. **Authentication & Presence:** 
   When a user logs in, the Client connects to the Server via Socket.io, passing their JWT and Avatar data. The Server registers their current IP address. The Server then broadcasts a `user_online` event to all other connected sockets sharing that *exact same IP address* (i.e., on the same Wi-Fi).

2. **The Handshake (Signaling):**
   When User A wants to chat with User B, they send a connection request via the Server. If User B accepts, the Server acts as a middleman (Signaling Server). 
   - User A generates a WebRTC "Offer" and sends it to the Server.
   - The Server relays the Offer to User B.
   - User B generates an "Answer" and sends it back through the Server.
   - Both clients exchange ICE candidates via the Server to discover the optimal network path to each other.

3. **Peer-to-Peer Communication:**
   Once the WebRTC handshake is complete, the Server steps out of the way. All chat messages and file transfers flow *directly* between User A and User B over the local network via `RTCDataChannel`. This ensures zero latency and absolute privacy—messages are never saved to the database.

---

## ✨ Key Features
- **Zero-Refresh Presence:** Users instantly appear and disappear from the dashboard as they join or leave the network.
- **P2P File Sharing:** Send files directly over the local network with an animated progress bar.
- **Profile Management:** Users can upload profile pictures, change their names, and update passwords securely.
- **Claude Aesthetic:** A highly sophisticated, minimalist UI featuring soft sand backgrounds, clean typography (Inter & Newsreader), and terracotta orange accents.
- **Auto-Sync Session Closure:** If one user closes the chat, the connection is instantly and cleanly terminated for both users.

---

## 🚀 Setup Locally

Follow these steps to run Blink on your local machine.

### Prerequisites
- Node.js (v18 or higher)
- MongoDB (Local instance or MongoDB Atlas cluster)

### 1. Server Setup
1. Open a terminal and navigate to the server directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `server` directory and configure the following variables:
   ```env
   PORT=4899
   DATABASE_URL=mongodb://localhost:27017/blink  # Or your Atlas connection string
   JWT_SECRET=your_super_secret_jwt_key
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

### 2. Client Setup
1. Open a new terminal and navigate to the client directory:
   ```bash
   cd client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure the API endpoint. Open `client/src/config.js` and ensure it points to your local server:
   ```javascript
   export const API_URL = "http://localhost:4899";
   ```
4. Start the frontend development server:
   ```bash
   npm run dev
   ```

### 3. Testing it Out
1. Open your browser and navigate to the URL provided by Vite (usually `http://localhost:5173`).
2. Create an account and upload a profile picture.
3. Open an Incognito window or a different browser, and create a second account.
4. Because both browsers are on the same machine (same network), they will instantly discover each other.
5. Click **Connect** to initiate a secure WebRTC P2P session!

---
*Built with ❤️ for real-time local communication.*