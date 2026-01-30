# **Software Requirements Specification (SRS)**

**Wi-Fi Based Ephemeral Messaging and File Sharing Web Application**

---

## **Page – 1**

## **1. Introduction**

### **1.1 Purpose**

The purpose of this document is to define the software requirements for a **Wi-Fi based ephemeral messaging and file sharing web application**.
This SRS serves as a reference for developers, testers, reviewers, and stakeholders to understand system functionality, constraints, and design expectations.

---

### **1.2 Document Conventions**

- **Shall** – Mandatory requirement
- **Should** – Recommended but optional
- **May** – Optional feature
- All requirements are numbered for traceability
- Technical terms are used consistently throughout the document

---

### **1.3 Project Scope**

The system enables users connected to the **same Wi-Fi network** to:

- Discover other users using the application
- Request and establish temporary chat sessions
- Exchange messages and files securely
- Automatically destroy all shared data once the session ends or Wi-Fi disconnects

The system **does not store messages or files permanently** and avoids cloud-based data persistence to ensure privacy.

---

### **1.4 References**

- WebRTC W3C Specification
- RFC 6455 – WebSocket Protocol
- OWASP Web Application Security Guidelines
- IEEE 830 / ISO/IEC 29148 SRS Standard

---

## **2. System Description**

The system is a **browser-based web application** that uses:

- A backend server for **authentication, presence management, and signaling**
- **Peer-to-peer communication (WebRTC)** for messaging and file sharing
- A **NoSQL database (MongoDB)** only for **user authentication data**

All chat sessions are **temporary** and limited to the duration of shared Wi-Fi connectivity.

---

---

## **Page – 2**

## **3. Functional Requirements**

### **FR-1:** User Authentication

The system shall allow users to register and log in using a username and password.

### **FR-2:** Wi-Fi Scoped User Discovery

The system shall display only users connected to the same Wi-Fi network.

### **FR-3:** Chat Request Approval

The system shall allow users to send chat requests which must be explicitly accepted.

### **FR-4:** Temporary Messaging

The system shall enable real-time messaging during an active chat session.

### **FR-5:** File Sharing

The system shall allow users to share files during an active session.

### **FR-5.1:** File Progress Display

The system shall display a visual progress bar indicating the percentage of file transfer completed for both sender and receiver.

### **FR-6:** Automatic Data Deletion

The system shall delete all messages and files when:

- Wi-Fi disconnects
- Any user ends the chat
- The browser session ends

---

## **4. System Features (Brief)**

- Web-based interface (no installation required)
- Same Wi-Fi user detection
- Peer-to-peer encrypted communication
- Temporary chat sessions
- Automatic data destruction
- No cloud storage of messages or files

---

## **5. Use Cases (Summary)**

### **UC-1: Temporary Chat Session**

A user discovers another user on the same Wi-Fi, sends a chat request, and exchanges messages/files until the session ends.

### **UC-2: Chat Termination**

Either user ends the chat or disconnects from Wi-Fi, causing automatic deletion of all session data.

---

---

## **Page – 3**

## **6. Use Case Diagram (Textual Representation)**

```
+--------+        +---------------------------+
| User A | -----> | Send Chat Request         |
+--------+        +---------------------------+
     |                     |
     |                     v
     |            +-------------------+
     |            | Accept / Reject   |
     |            +-------------------+
     |                     |
     v                     v
+--------------------------------------------+
| Temporary Chat & File Sharing Session      |
+--------------------------------------------+
                     |
                     v
          +-------------------------+
          | Chat Terminated         |
          | (Wi-Fi / User Action)   |
          +-------------------------+
```

---

## **7. Data Dictionary**

| Data Item      | Description               | Type     |
| -------------- | ------------------------- | -------- |
| user_id        | Unique user identifier    | ObjectId |
| username       | Display name              | String   |
| password_hash  | Encrypted password        | String   |
| session_id     | Temporary chat session ID | UUID     |
| message        | Chat message content      | String   |
| file_blob      | Temporary shared file     | Binary   |
| wifi_signature | Network identifier        | String   |

---

---

## **Page – 4**

## **8. External Interface Requirements**

### **8.1 User Interface**

- Web-based UI accessible via modern browsers
- Displays:
  - Online users (same Wi-Fi)
  - Chat request notifications
  - Chat window and file transfer progress

### **8.2 Software Interfaces**

- WebSocket for signaling and presence
- WebRTC Data Channels for peer-to-peer communication
- REST APIs for authentication

---

## **9. Non-Functional Requirements**

### **9.1 Performance**

- Message delivery latency shall be under 200 ms on local Wi-Fi
- File transfer speed shall utilize available LAN bandwidth

### **9.2 Security**

- All communications shall be encrypted
- No chat data shall be stored on the server
- Authentication credentials shall be securely hashed

### **9.3 Usability**

- Minimal user interaction to start a chat
- Clear indicators for session status and connectivity

### **9.4 Reliability**

- The system shall handle unexpected disconnections gracefully
- Automatic cleanup of temporary data shall be enforced

---

## **10. Open Issues**

- Accuracy of same Wi-Fi detection using public IP
- Handling networks with client isolation enabled

- Browser compatibility differences for WebRTC
