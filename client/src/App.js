import { useState, useEffect } from "react"
import { io } from "socket.io-client"

const socket = io("http://localhost:3001") // Подключение к backend-сокету

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
  const handleEndChat = () => {
    if (connectedRoom) {
      socket.emit("endChat", { roomId: connectedRoom })
    }
    setConnectedRoom(null)
    setChat([])
    setIsRoomReady(false)
  }

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
      socket.emit("joinRoomAck", { roomId })
    })

    socket.on("message", ({ text, from }) => {
      setChat(prev => [...prev, { text, from }])
    })

    socket.on("chatEnded", () => {
      setConnectedRoom(null)
      setChat([])
      setIsRoomReady(false)
      setInChat(false)
      alert("Собеседник завершил чат")
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

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <div>socket.id: {mySocketId}</div>
      <h2>Анонимный чат</h2>

      <div>
        <label>Ваш пол: </label>
        <select value={gender} onChange={e => setGender(e.target.value)}>
          <option value="m">Мужской</option>
          <option value="f">Женский</option>
        </select>
      </div>

      <div>
        <label>Ваш возраст: </label>
        <select value={ageGroup} onChange={e => setAgeGroup(e.target.value)}>
          <option value="18+">18+</option>
          <option value="18-25">18–25</option>
          <option value="25-35">25–35</option>
          <option value="35+">35+</option>
        </select>
      </div>

      <div>
        <label>Ищу пол: </label>
        <select value={seekingGender} onChange={e => setSeekingGender(e.target.value)}>
          <option value="m">Мужской</option>
          <option value="f">Женский</option>
        </select>
      </div>

      <div>
        <label>Ищу возраст: </label>
        <select value={seekingAgeGroup} onChange={e => setSeekingAgeGroup(e.target.value)}>
          <option value="18+">18+</option>
          <option value="18-25">18–25</option>
          <option value="25-35">25–35</option>
          <option value="35+">35+</option>
        </select>
      </div>

      <div style={{ marginTop: "20px" }}>
        <button onClick={handleSearch}>🔍 Найти собеседника</button>
      </div>

      {connectedRoom && (
  <div style={{ marginTop: "20px" }}>
    ✅ Вы подключены к комнате: <strong>{connectedRoom}</strong>
    {!isRoomReady && <div style={{ color: "orange", marginTop: 10 }}>Ждём собеседника…</div>}

    {isRoomReady && (
      <>
        <button
          onClick={handleEndChat}
          style={{ marginTop: 16, background: "red", color: "white" }}
        >
          Завершить чат
        </button>

        <div style={{ marginTop: "20px" }}>
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Введите сообщение"
            style={{ width: "300px", padding: "5px" }}
          />
          <button onClick={handleSendMessage} style={{ marginLeft: "10px" }}>
            ➤ Отправить
          </button>
        </div>

        <div style={{ marginTop: "20px" }}>
          <h4>Чат:</h4>
          {chat.map((msg, i) => (
            <div key={i}>
              <strong>{msg.from === mySocketId ? "Вы" : "Собеседник"}:</strong> {msg.text}
            </div>
          ))}
        </div>
      </>
    )}
  </div>
)}
    </div>
  )
}

export default App