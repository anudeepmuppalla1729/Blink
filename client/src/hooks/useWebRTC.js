import { useEffect, useRef, useState, useCallback } from "react";
import Peer from "simple-peer";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";

export const useWebRTC = () => {
  const socket = useSocket();
  const { user } = useAuth();
  const [peer, setPeer] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [incomingFile, setIncomingFile] = useState(null);
  const peerRef = useRef(null);
  const incomingFiles = useRef({}); // { fileId: { meta, chunks: [], receivedChunks: 0 } }

  // Handle incoming signals
  useEffect(() => {
    if (!socket) return;

    socket.on("signal", ({ fromUserId, signal }) => {
      console.log("Received signal from", fromUserId);
      if (peerRef.current) {
        // We already have a peer, signal it
        peerRef.current.signal(signal);
      } else {
        // Incoming connection (Answerer)
        // Note: In a real app, we should check if this signal is for an accepted chat
        // For simplicity, we assume if we get a signal, it's valid if we are not busy?
        // Actually, we need to know WHO we are talking to.
        // Let's assume the UI handles the "Accept" and then initiates or listens.
        // But simple-peer needs to be created to handle the offer.

        // CAUTION: This simple logic assumes 1 active chat at a time
        const newPeer = new Peer({
          initiator: false,
          trickle: false,
        });

        newPeer.on("signal", (data) => {
          socket.emit("signal", { toUserId: fromUserId, signal: data });
        });

        newPeer.on("connect", () => {
          console.log("Peer connected");
          setIsConnected(true);
        });

        newPeer.on("data", (data) => {
          handleData(data, fromUserId);
        });

        newPeer.on("close", () => cleanup());
        newPeer.on("error", (err) => console.error("Peer error:", err));

        newPeer.signal(signal);
        peerRef.current = newPeer;
        setPeer(newPeer);
      }
    });

    return () => {
      socket.off("signal");
    };
  }, [socket]);

  const initiateConnection = (toUserId) => {
    const newPeer = new Peer({
      initiator: true,
      trickle: false,
    });

    newPeer.on("signal", (data) => {
      socket.emit("signal", { toUserId, signal: data });
    });

    newPeer.on("connect", () => {
      console.log("Peer connected (Initiator)");
      setIsConnected(true);
    });

    newPeer.on("data", (data) => {
      handleData(data, toUserId);
    });

    newPeer.on("close", () => cleanup());
    newPeer.on("error", (err) => console.error("Peer error:", err));

    peerRef.current = newPeer;
    setPeer(newPeer);
  };

  /* File Transfer State */
  const [fileChunks, setFileChunks] = useState([]);
  const [fileMeta, setFileMeta] = useState(null);

  const handleData = (data, senderId) => {
    try {
      const dataStr = data.toString();
      let parsed;
      try {
        parsed = JSON.parse(dataStr);
      } catch (err) {
        console.error("Non-JSON data received:", err);
        return;
      }

      if (parsed) {
        if (parsed.type === "text") {
          setMessages((prev) => [
            ...prev,
            { senderId, content: parsed.content, type: "text" },
          ]);
        } else if (parsed.type === "FILE_START") {
          // Initialize file reception
          incomingFiles.current[parsed.fileId] = {
            meta: parsed,
            chunks: new Array(parsed.totalChunks),
            receivedCount: 0,
          };
          console.log(
            `Receiving file: ${parsed.fileName} (${parsed.totalChunks} chunks)`,
          );

          // Add downloading message
          setMessages((prev) => [
            ...prev,
            {
              senderId,
              fileId: parsed.fileId,
              fileName: parsed.fileName,
              fileType: parsed.fileType,
              status: "downloading",
              progress: 0,
              type: "file",
            },
          ]);
        } else if (parsed.type === "FILE_CHUNK") {
          const { fileId, chunkIndex, content } = parsed;
          const fileData = incomingFiles.current[fileId];
          if (fileData) {
            fileData.chunks[chunkIndex] = content;
            fileData.receivedCount++;

            // Update progress
            const progress = Math.round(
              (fileData.receivedCount / fileData.meta.totalChunks) * 100,
            );

            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.fileId === fileId) {
                  return { ...msg, progress };
                }
                return msg;
              }),
            );

            if (fileData.receivedCount === fileData.meta.totalChunks) {
              finishFileReception(fileId, senderId);
            }
          }
        }
      }
    } catch (e) {
      console.error("Error handling data", e);
    }
  };

  const finishFileReception = (fileId, senderId) => {
    const fileData = incomingFiles.current[fileId];
    if (!fileData) return;

    const { meta, chunks } = fileData;

    // Convert base64 chunks back to Blob
    // Note: effective way to handle large arrays of base64?
    // Fetch API or basic byte conversion.
    // For very large files, this step might still spike memory, but it's better than holding one huge string.
    // We process chunks: base64 -> Uint8Array -> Blob

    const byteArrays = chunks.map((b64) => {
      const binaryString = window.atob(b64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    });

    const blob = new Blob(byteArrays, { type: meta.fileType });
    const url = URL.createObjectURL(blob);

    // Update existing message to completed
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.fileId === fileId) {
          return {
            ...msg,
            content: url,
            status: "completed",
            progress: 100,
          };
        }
        return msg;
      }),
    );

    // Cleanup
    delete incomingFiles.current[fileId];
    console.log(`File received: ${meta.fileName}`);
  };

  const CHUNK_SIZE = 16 * 1024; // 16KB chunks to be safe with WebRTC

  const sendChunkedFile = async (file) => {
    if (!peerRef.current || !peerRef.current.connected) {
      console.warn("Peer not connected, cannot send file");
      return;
    }

    const fileId = crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // 1. Send File Start Signal
    const startMsg = {
      type: "FILE_START",
      fileId,
      fileName: file.name,
      fileType: file.type,
      size: file.size,
      totalChunks,
    };
    peerRef.current.send(JSON.stringify(startMsg));

    // 2. Read and Send Chunks
    let offset = 0;
    let chunkIndex = 0;

    // Create initial message for sender
    setMessages((prev) => [
      ...prev,
      {
        senderId: "me",
        fileId,
        fileName: file.name,
        fileType: file.type,
        status: "uploading",
        progress: 0,
        type: "file",
      },
    ]);

    // Helper to read chunk as DataURL (base64)
    const readChunk = (start, end) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          // result is "data:application/octet-stream;base64,....."
          // We only want the base64 part
          const result = reader.result;
          const base64 = result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file.slice(start, end));
      });
    };

    while (offset < file.size) {
      if (!peerRef.current || !peerRef.current.connected) {
        console.warn("Connection lost during file transfer");
        break;
      }

      try {
        const chunkBase64 = await readChunk(offset, offset + CHUNK_SIZE);

        const chunkMsg = {
          type: "FILE_CHUNK",
          fileId,
          chunkIndex,
          content: chunkBase64,
        };

        peerRef.current.send(JSON.stringify(chunkMsg));

        offset += CHUNK_SIZE;
        chunkIndex++;

        // Update sender progress
        const progress = Math.round((chunkIndex / totalChunks) * 100);
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.fileId === fileId) {
              return { ...msg, progress };
            }
            return msg;
          }),
        );

        // Simple throttling to prevent flooding the data channel too fast
        // For very large files, checking bufferedAmount would be better,
        // but a small delay helps significantly.
        await new Promise((r) => setTimeout(r, 5));
      } catch (err) {
        console.error("Error sending chunk", err);
        break;
      }
    }

    console.log("File sent successfully");

    // Update sender message to completed
    const localUrl = URL.createObjectURL(file);
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.fileId === fileId) {
          return {
            ...msg,
            content: localUrl,
            status: "completed",
            progress: 100,
          };
        }
        return msg;
      }),
    );
  };

  const sendMessage = (content, type = "text") => {
    if (peerRef.current && peerRef.current.connected) {
      if (type === "file") {
        // content is a File object
        sendChunkedFile(content);
      } else {
        const msg = { type: "text", content };
        peerRef.current.send(JSON.stringify(msg));
        setMessages((prev) => [
          ...prev,
          { senderId: "me", content, type: "text" },
        ]);
      }
    } else {
      console.warn("Peer not connected, cannot send message");
    }
  };

  const cleanup = () => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    setPeer(null);
    setIsConnected(false);
    setMessages([]);
    setFileChunks([]);
    setFileMeta(null);
  };

  return { initiateConnection, isConnected, messages, sendMessage, cleanup };
};
