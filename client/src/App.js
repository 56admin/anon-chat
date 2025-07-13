import { useState, useEffect } from "react"
import { io } from "socket.io-client"

const socket = io("http://localhost:3001") // Подключение к backend-сокету

function saveChatAsHtml(chat, mySocketId) {
  const html =
    `<html><body><h2>История чата</h2>` +
    chat.map(msg =>
      `<div><b>${msg.from === mySocketId ? "Вы" : "Собеседник"}:</b> ${msg.text}</div>`
    ).join('') +
    `</body></html>`
  const blob = new Blob([html], { type: "text/html" })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = "chat.html"
  link.click()
}

function App() {
  // 🧠 Выбор пользователя
  const [gender, setGender] = useState("m")
  const [ageGroup, setAgeGroup] = useState("18-25")
  const [seekingGender, setSeekingGender] = useState("f")
  const [seekingAgeGroup, setSeekingAgeGroup] = useState("18-25")

  // 🔁 Комната и сообщения
  const [connectedRoom, setConnectedRoom] = useState(null)
  const [message, setMessage] = useState("") // Вводимое сообщение
  const [chat, setChat] = useState([])       // История сообщений
  const [mySocketId, setMySocketId] = useState("") //Знаем свой id в чате
  const [isRoomReady, setIsRoomReady] = useState(false) // можно ли писать сообщения
  const [inChat, setInChat] = useState(false) //При “joinRoom” и “roomReady” ставить setInChat(true); при завершении чата — setInChat(false)
  const [chatEnded, setChatEnded] = useState(false)

  const handleFindNewPartner = () => {
    setConnectedRoom(null);
    setChatEnded(false);
    setChat([]);
    setIsRoomReady(false);
    setIsSearching(true);
    handleSearch(); // Чтобы показывалась форма поиска!
  }; 
  
  const [isSearching, setIsSearching] = useState(false)


  // 🔌 При подключении к комнате или получении сообщений
  useEffect(() => {

    socket.on("roomReady", () => {
      setIsRoomReady(true)
      console.log("Комната готова к чату!");
    });
    
    // Получаем свой socket.id при подключении
    socket.on("connect", () => {
    setMySocketId(socket.id)
    console.log("МОЙ socket.id:", socket.id)
    })

    socket.on("joinRoom", ({ roomId }) => {
      setConnectedRoom(roomId)
      setIsSearching(false)
      socket.emit("joinRoomAck", { roomId })
    })

    socket.on("message", ({ text, from }) => {
      setChat(prev => [...prev, { text, from }])
    })

    socket.on("chatEnded", () => {
      setIsRoomReady(false)
      setChatEnded(true)
    })

    return () => {
      socket.off("connect")
      socket.off("joinRoom")
      socket.off("message")
      socket.off("roomReady")
      socket.off("chatEnded")
    }
  }, [])

  // 🔍 Отправить запрос на поиск собеседника
  const handleSearch = () => {
    setIsSearching(true)
    socket.emit("join", {
      gender,
      ageGroup,
      seekingGender,
      seekingAgeGroup,
    })
  }

  // 📤 Отправка сообщения
  const handleSendMessage = () => {
    if (message.trim() === "") return
    socket.emit("message", { roomId: connectedRoom, text: message })
    setMessage("")
  }

  const handleEndChat = () => {
    if (connectedRoom) {
      socket.emit("endChat", { roomId: connectedRoom })
      // локально очистим
      setIsRoomReady(false)
      setChatEnded(true)
    }
  }

  return (
    <div style={{
      maxWidth: 420,
      margin: "50px auto",
      padding: 24,
      borderRadius: 12,
      boxShadow: "0 2px 16px #0001",
      fontFamily: "Inter, Arial, sans-serif",
      background: "#f9f9ff"
    }}>
      <h2 style={{textAlign: "center"}}>Анонимный чат</h2>

      {/* БЛОК: Поиск собеседника */}
    {isSearching && !connectedRoom && (
      <div style={{textAlign: "center", padding: 32}}>
        <div style={{fontSize: 28}}>🔍</div>
        <div style={{marginTop: 18, fontSize: 20, color: "#333"}}>
          Ищем собеседника...
        </div>
        <div style={{marginTop: 8, fontSize: 14, color: "#999"}}>
          Обычно это занимает несколько секунд
        </div>
      </div>
    )}

      {/* БЛОК: Форма выбора параметров */}
      {!isSearching && !connectedRoom && (
        <form onSubmit={e => { e.preventDefault(); handleSearch() }}>
          <div style={{marginBottom: 12}}>
            <label>Ваш пол: </label>
            <select value={gender} onChange={e => setGender(e.target.value)}>
              <option value="m">Мужской</option>
              <option value="f">Женский</option>
            </select>
          </div>
          <div style={{marginBottom: 12}}>
            <label>Ваш возраст: </label>
            <select value={ageGroup} onChange={e => setAgeGroup(e.target.value)}>
              <option value="18">18</option>
              <option value="19-25">19–25</option>
              <option value="25-35">25–35</option>
              <option value="35+">35+</option>
            </select>
          </div>
          <div style={{marginBottom: 12}}>
            <label>Ищу пол: </label>
            <select value={seekingGender} onChange={e => setSeekingGender(e.target.value)}>
              <option value="m">Мужской</option>
              <option value="f">Женский</option>
            </select>
          </div>
          <div style={{marginBottom: 24}}>
            <label>Ищу возраст: </label>
            <select value={seekingAgeGroup} onChange={e => setSeekingAgeGroup(e.target.value)}>
              <option value="18">18</option>
              <option value="19-25">19–25</option>
              <option value="25-35">25–35</option>
              <option value="35+">35+</option>
            </select>
          </div>
          <button style={{
            width: "100%", padding: 10, fontSize: 18, borderRadius: 6,
            background: "#654af5", color: "white", border: "none"
          }}>
            🔍 Найти собеседника
          </button>
        </form>
      )}

{connectedRoom && (
  <div>
    {chatEnded ? (
      // ====== МЕНЮ ПОСЛЕ ЗАВЕРШЕНИЯ ЧАТА ======
      <div style={{textAlign: "center", margin: "30px 0"}}>
        <h3>Чат завершён!</h3>
        <button onClick={handleFindNewPartner}>🔄 Найти нового собеседника</button>
        <button onClick={() => saveChatAsHtml(chat, mySocketId)}>💾 Сохранить чат</button>
        <button onClick={() => { 
          setChatEnded(false);
          setConnectedRoom(null); 
          setChat([]);
         }}>⚙️ Изменить параметры поиска</button>
      </div>
    ) : (
      // ====== СТАНДАРТНЫЙ ЧАТ ======
      <>
        <div style={{marginBottom: 12, textAlign: "center"}}>
          <span style={{color: "#222"}}>
            ✅ Вы подключены к комнате: <strong>{connectedRoom}</strong>
          </span>
        </div>
        {!isRoomReady && <div style={{ color: "#ff9600", textAlign: "center" }}>Ждём собеседника…</div>}

        {isRoomReady && (
          <>
            <button
              onClick={handleEndChat}
              style={{
                background: "#f44", color: "#fff", border: "none",
                borderRadius: 5, padding: "8px 16px", margin: "0 auto 16px", display: "block"
              }}
            >
              Завершить чат
            </button>
            <div style={{display: "flex", marginBottom: 16}}>
              <input
                type="text"
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Введите сообщение"
                style={{ flex: 1, padding: "8px 6px", borderRadius: 5, border: "1px solid #ccc" }}
                onKeyDown={e => { if (e.key === "Enter") handleSendMessage() }}
              />
              <button
                onClick={handleSendMessage}
                style={{
                  marginLeft: 8, background: "#654af5", color: "#fff",
                  border: "none", borderRadius: 5, padding: "8px 12px"
                }}
              >
                ➤
              </button>
            </div>
            <div style={{
              background: "#fff", borderRadius: 8, minHeight: 100, padding: 10,
              boxShadow: "0 1px 4px #0001", marginBottom: 8, maxHeight: 220, overflowY: "auto"
            }}>
              {chat.map((msg, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <strong style={{color: msg.from === mySocketId ? "#654af5" : "#444"}}>
                    {msg.from === mySocketId ? "Вы" : "Собеседник"}:
                  </strong>{" "}
                  <span>{msg.text}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </>
    )}
  </div>
)}
    </div>
  )
}

export default App