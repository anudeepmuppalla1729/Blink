# 🔷 High Level Design (HLD)

## 📌 System Overview

The system follows a **hybrid architecture**:

* **Centralized backend** → login, presence, signaling
* **Decentralized peer-to-peer layer** → chat & file sharing

👉 **No message or file ever goes to the server**

---

### (Use this diagram idea while drawing manually)

```
+--------------------+          +--------------------+
|   User Browser A   |          |   User Browser B   |
| (Web App - React)  |          | (Web App - React)  |
+---------+----------+          +----------+---------+
          |                                |
          |  WebRTC (P2P, Encrypted)      |
          |<------------------------------>|
          |   Messages & File Transfer    |
          |                                |
          +--------------+  +--------------+
                         |  |
                  +------+--+------+
                  |  Backend Server |
                  | (Node.js)       |
                  |-----------------|
                  | Auth (JWT)      |
                  | Presence        |
                  | WebSocket       |
                  | Signaling       |
                  +------+----------+
                         |
                  +------v----------+
                  |   Login DB      |
                  | (PostgreSQL)    |
                  +-----------------+
```

---

## 🧠 Component-wise Design

---

## 1️⃣ Web Client (Browser Application)

**Responsibilities**

* User login & logout
* Display users on same Wi-Fi
* Send/receive chat requests
* Handle chat UI
* Manage file uploads/downloads
* Destroy data on session end

**Technologies**

* React / Next.js
* WebSocket (presence & signaling)
* WebRTC DataChannels (chat + files)

**Important Rule**

> Messages and files exist only in **memory / temporary blobs**

---

## 2️⃣ Backend Server (Minimal & Stateless)

**Responsibilities**

* Authenticate users
* Maintain online user list
* Detect same Wi-Fi users
* Exchange WebRTC signaling data
* Enforce access rules

**What it does NOT do**

* ❌ Store messages
* ❌ Store files
* ❌ Read message content

**Technologies**

* Node.js + Express
* WebSocket (Socket.IO / ws)
* JWT authentication

---

## 3️⃣ Authentication Database

**Purpose**

* Store user credentials only

**Data Stored**

* user_id
* username
* password_hash

**No chat data is stored**

**Technology**

* PostgreSQL

---

## 4️⃣ Presence & Same Wi-Fi Detection

**Logic**

* Backend tracks:

  * Logged-in users
  * Public IP address
* Users with same public IP:

  * Considered on same Wi-Fi
  * Shown in discovery list

**Flow**

```
User connects → Backend
Backend checks IP
Backend groups users
Frontend shows same-Wi-Fi users
```

---

## 5️⃣ Chat Session Establishment (Signaling Flow)

**Step-by-step**

1. User A sends chat request
2. Backend forwards request to User B
3. User B accepts
4. Backend exchanges:

   * WebRTC offer
   * WebRTC answer
   * ICE candidates
5. Direct P2P channel established
6. Backend is no longer involved

---

## 6️⃣ Message & File Transfer (Core Feature)

**Technology**

* WebRTC DataChannels

**Characteristics**

* Encrypted (DTLS)
* Peer-to-peer
* High-speed on LAN
* No server relay

**File Handling**

* Chunk-based transfer
* Stored as temporary blobs
* Auto-deleted on session end

---

## 7️⃣ Session Termination & Cleanup

**Triggered when**

* Wi-Fi disconnects
* User clicks “End Chat”
* Browser closes
* Network changes

**Actions**

* Close WebRTC channel
* Clear memory
* Delete blobs
* Invalidate session keys

---

## 🔐 Security at High Level

| Layer     | Security               |
| --------- | ---------------------- |
| Login     | Hashed passwords + JWT |
| Signaling | Secure WebSocket (WSS) |
| Chat      | End-to-end encrypted   |
| Storage   | No persistence         |

---

## 🧾 How to explain this in viva (ready-made)

> “The system uses a minimal backend for authentication and signaling, while all chat and file sharing occurs through encrypted peer-to-peer WebRTC connections within the same Wi-Fi network. No messages or files are stored on the server, ensuring privacy and ephemerality.”

---

## 🖊️ How to draw this in exam / report

1. Draw **two user browsers**
2. Draw **one backend server**
3. Draw **database under backend**
4. Connect:

   * Browser → Server (WebSocket)
   * Browser ↔ Browser (WebRTC)

