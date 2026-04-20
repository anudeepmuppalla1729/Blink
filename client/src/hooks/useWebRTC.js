import { useEffect, useRef, useState, useCallback } from "react";
import Peer from "simple-peer";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";

export const useWebRTC = () => {
  const socket = useSocket();
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const peerRef = useRef(null);
  const incomingFiles = useRef({});
  const onPeerCloseRef = useRef(null); // callback set by App.jsx

  // Register an onPeerClose callback from outside
  const setOnPeerClose = useCallback((fn) => {
    onPeerCloseRef.current = fn;
  }, []);

  // Handle incoming signals
  useEffect(() => {
    if (!socket) return;

    const handleSignal = ({ fromUserId, signal }) => {
      if (peerRef.current) {
        peerRef.current.signal(signal);
      } else {
        // Answerer side — create peer
        const newPeer = new Peer({ initiator: false, trickle: false });

        newPeer.on("signal", (data) => {
          socket.emit("signal", { toUserId: fromUserId, signal: data });
        });

        newPeer.on("connect", () => {
          setIsConnected(true);
        });

        newPeer.on("data", (data) => {
          handleData(data, fromUserId);
        });

        newPeer.on("close", () => {
          cleanup();
          onPeerCloseRef.current?.();
        });

        newPeer.on("error", (err) => console.error("Peer error:", err));

        newPeer.signal(signal);
        peerRef.current = newPeer;
      }
    };

    socket.on("signal", handleSignal);
    return () => socket.off("signal", handleSignal);
  }, [socket]);

  const initiateConnection = (toUserId) => {
    const newPeer = new Peer({ initiator: true, trickle: false });

    newPeer.on("signal", (data) => {
      socket.emit("signal", { toUserId, signal: data });
    });

    newPeer.on("connect", () => {
      setIsConnected(true);
    });

    newPeer.on("data", (data) => {
      handleData(data, toUserId);
    });

    newPeer.on("close", () => {
      cleanup();
      onPeerCloseRef.current?.();
    });

    newPeer.on("error", (err) => console.error("Peer error:", err));

    peerRef.current = newPeer;
  };

  const handleData = (data, senderId) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (!parsed) return;

      if (parsed.type === "text") {
        setMessages((prev) => [
          ...prev,
          { senderId, content: parsed.content, type: "text", ts: Date.now() },
        ]);
      } else if (parsed.type === "FILE_START") {
        incomingFiles.current[parsed.fileId] = {
          meta: parsed,
          chunks: new Array(parsed.totalChunks),
          receivedCount: 0,
        };
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
            ts: Date.now(),
          },
        ]);
      } else if (parsed.type === "FILE_CHUNK") {
        const { fileId, chunkIndex, content } = parsed;
        const fileData = incomingFiles.current[fileId];
        if (fileData) {
          fileData.chunks[chunkIndex] = content;
          fileData.receivedCount++;
          const progress = Math.round(
            (fileData.receivedCount / fileData.meta.totalChunks) * 100
          );
          setMessages((prev) =>
            prev.map((msg) =>
              msg.fileId === fileId ? { ...msg, progress } : msg
            )
          );
          if (fileData.receivedCount === fileData.meta.totalChunks) {
            finishFileReception(fileId, senderId);
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
    const byteArrays = chunks.map((b64) => {
      const binaryString = window.atob(b64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    });
    const blob = new Blob(byteArrays, { type: meta.fileType });
    const url = URL.createObjectURL(blob);
    setMessages((prev) =>
      prev.map((msg) =>
        msg.fileId === fileId
          ? { ...msg, content: url, status: "completed", progress: 100 }
          : msg
      )
    );
    delete incomingFiles.current[fileId];
  };

  const CHUNK_SIZE = 16 * 1024;

  const sendChunkedFile = async (file) => {
    if (!peerRef.current?.connected) return;
    const fileId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    peerRef.current.send(
      JSON.stringify({ type: "FILE_START", fileId, fileName: file.name, fileType: file.type, size: file.size, totalChunks })
    );

    setMessages((prev) => [
      ...prev,
      { senderId: "me", fileId, fileName: file.name, fileType: file.type, status: "uploading", progress: 0, type: "file", ts: Date.now() },
    ]);

    let offset = 0;
    let chunkIndex = 0;
    const readChunk = (start, end) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file.slice(start, end));
      });

    while (offset < file.size) {
      if (!peerRef.current?.connected) break;
      try {
        const chunkBase64 = await readChunk(offset, offset + CHUNK_SIZE);
        peerRef.current.send(JSON.stringify({ type: "FILE_CHUNK", fileId, chunkIndex, content: chunkBase64 }));
        offset += CHUNK_SIZE;
        chunkIndex++;
        const progress = Math.round((chunkIndex / totalChunks) * 100);
        setMessages((prev) =>
          prev.map((msg) => (msg.fileId === fileId ? { ...msg, progress } : msg))
        );
        await new Promise((r) => setTimeout(r, 5));
      } catch (err) {
        console.error("Chunk send error", err);
        break;
      }
    }

    const localUrl = URL.createObjectURL(file);
    setMessages((prev) =>
      prev.map((msg) =>
        msg.fileId === fileId
          ? { ...msg, content: localUrl, status: "completed", progress: 100 }
          : msg
      )
    );
  };

  const sendMessage = (content, type = "text") => {
    if (peerRef.current?.connected) {
      if (type === "file") {
        sendChunkedFile(content);
      } else {
        peerRef.current.send(JSON.stringify({ type: "text", content }));
        setMessages((prev) => [
          ...prev,
          { senderId: "me", content, type: "text", ts: Date.now() },
        ]);
      }
    }
  };

  const cleanup = () => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    setIsConnected(false);
    setMessages([]);
    incomingFiles.current = {};
  };

  return { initiateConnection, isConnected, messages, sendMessage, cleanup, setOnPeerClose };
};
