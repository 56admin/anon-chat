import { useState, useEffect } from "react"
import { io } from "socket.io-client"



const socket = io("http://localhost:3001", {
  withCredentials: true //
});
// Подключение к backend-сокету + получение AnonClientId


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
  const [ageGroup, setAgeGroup] = useState("19-25")
  const [seekingGender, setSeekingGender] = useState("f")
  const [seekingAgeGroups, setSeekingAgeGroups] = useState(["19-25"]);

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
      seekingAgeGroups,
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
      maxWidth: 420, margin: "50px auto", padding: 24,
      borderRadius: 12, boxShadow: "0 2px 16px #0001",
      fontFamily: "Inter, Arial, sans-serif", background: "#f9f9ff"
    }}>
      <h2 style={{textAlign: "center", letterSpacing: 1, color: "#222", marginBottom: 24}}>
        Анонимный чат
      </h2>
  
      {/* Поиск/ожидание */}
      {isSearching && !connectedRoom && (
        <div style={{
          textAlign: "center", padding: 36,
          background: "#fff", borderRadius: 10, boxShadow: "0 1px 4px #0001"
        }}>
          <div style={{fontSize: 32}}>🔍</div>
          <div style={{marginTop: 14, fontSize: 18, color: "#333"}}>Ищем собеседника…</div>
          <div style={{marginTop: 8, fontSize: 13, color: "#999"}}>Обычно это занимает несколько секунд</div>
        </div>
      )}
  
      {/* Форма параметров поиска */}
      {!isSearching && !connectedRoom && (
        <form onSubmit={e => { e.preventDefault(); handleSearch() }} style={{background: "#fff", borderRadius: 10, padding: 18, boxShadow: "0 1px 4px #0001"}}>
          <FormRow label="Ваш пол:">
            <select value={gender} onChange={e => setGender(e.target.value)} style={inputStyle}>
              <option value="m">Мужской</option>
              <option value="f">Женский</option>
            </select>
          </FormRow>
          <FormRow label="Ваш возраст:">
            <select value={ageGroup} onChange={e => setAgeGroup(e.target.value)} style={inputStyle}>
              <option value="18">18</option>
              <option value="19-25">19–25</option>
              <option value="26-35">26–35</option>
              <option value="36+">35+</option>
            </select>
          </FormRow>
          <FormRow label="Ищу пол:">
            <select value={seekingGender} onChange={e => setSeekingGender(e.target.value)} style={inputStyle}>
              <option value="m">Мужской</option>
              <option value="f">Женский</option>
            </select>
          </FormRow>
          <FormRow label="Ищу возраст:">
            <div style={{display: "flex", flexWrap: "wrap", gap: "8px 18px"}}>
              {["18", "19-25", "26-35", "36+"].map(val => (
                <label key={val} style={{
                  userSelect: "none",
                  fontSize: 15,
                  display: "flex", alignItems: "center", gap: 6,
                  marginBottom: 3
                }}>
                  <input
                    type="checkbox"
                    value={val}
                    checked={seekingAgeGroups.includes(val)}
                    onChange={e => {
                      if (e.target.checked) setSeekingAgeGroups(arr => [...arr, val])
                      else setSeekingAgeGroups(arr => arr.filter(v => v !== val))
                    }}
                    style={{marginRight: 3}}
                  />
                  {val}
                </label>
              ))}
            </div>
          </FormRow>
          <button
            style={buttonStyle}
            disabled={!seekingAgeGroups.length}
          >
            🔍 Найти собеседника
          </button>
        </form>
      )}
  
      {/* Чат или меню после чата */}
      {connectedRoom && (
        <div>
          {chatEnded ? (
            <div style={{textAlign: "center", margin: "30px 0"}}>
              <h3>Чат завершён!</h3>
              <button style={buttonStyle} onClick={handleFindNewPartner}>🔄 Найти нового собеседника</button>
              <button style={buttonStyle} onClick={() => saveChatAsHtml(chat, mySocketId)}>💾 Сохранить чат</button>
              <button style={buttonStyle} onClick={() => {
                setChatEnded(false); setConnectedRoom(null); setChat([]);
              }}>⚙️ Изменить параметры поиска</button>
            </div>
          ) : (
            <>
              <div style={{marginBottom: 12, textAlign: "center"}}>
                <span style={{color: "#222"}}>
                  ✅ Вы подключены к комнате: <strong>{connectedRoom}</strong>
                </span>
              </div>
              {!isRoomReady && <div style={{ color: "#ff9600", textAlign: "center" }}>Ждём собеседника…</div>}
  
              {isRoomReady && (
                <>
                  <button style={{...buttonStyle, background: "#f44"}} onClick={handleEndChat}>
                    Завершить чат
                    </button>
                    
                  <button
                      onClick={() => {
                      socket.emit('ignoreUser', { roomId: connectedRoom });
                      // Локально завершаем чат и через 1 сек. ищем нового:
                      setConnectedRoom(null);
                      setTimeout(() => handleSearch(), 1000);
                                    }}
>
                      🚫 Игнорировать на 1 час
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
                    <button style={{...buttonStyle, marginLeft: 8}} onClick={handleSendMessage}>
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
// ==========================
// Helper-компоненты и стили:
function FormRow({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: "block",
        marginBottom: 4,
        color: "#444",
        fontWeight: 500
      }}>{label}</label>
      {children}
    </div>
  )
}

const buttonStyle = {
  width: "100%",
  padding: 10,
  fontSize: 16,
  borderRadius: 6,
  background: "#654af5",
  color: "white",
  border: "none",
  marginBottom: 10,
  marginTop: 5,
  cursor: "pointer"
};
const inputStyle = {
  width: "100%",
  padding: 7,
  fontSize: 16,
  borderRadius: 5,
  border: "1px solid #bbb"
};

// --- Только после всех объявлений!
export default App