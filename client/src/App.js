import { useState, useEffect, useRef } from "react"
import { io } from "socket.io-client"



const apiBase = "http://localhost:3001";
const socket = io(apiBase, {
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
  const [adultMode, setAdultMode] = useState(false); // 🔞 Режим 18+
  const [tag, setTag] = useState("");                // 🏷 Тег

  // 🔁 Комната и сообщения
  const [connectedRoom, setConnectedRoom] = useState(null)
  const [message, setMessage] = useState("") // Вводимое сообщение
  const [chat, setChat] = useState([])       // История сообщений
  const [mySocketId, setMySocketId] = useState("") //Знаем свой id в чате
  const [isRoomReady, setIsRoomReady] = useState(false) // можно ли писать сообщения
  const [inChat, setInChat] = useState(false) //При “joinRoom” и “roomReady” ставить setInChat(true); при завершении чата — setInChat(false)
  const [chatEnded, setChatEnded] = useState(false)
  const [showComplain, setShowComplain] = useState(false)
  // ссылка на input для загрузки фото
  const fileInputRef = useRef(null)
  // ссылка на контейнер для автоскролла сообщений
  const chatContainerRef = useRef(null)
  const [showMore, setShowMore] = useState(false)
  const [systemMessages, setSystemMessages] = useState([])
  const addSystemMessage = (text) => {
    setSystemMessages(prev => [...prev, { id: Date.now(), text }])
  }
  // ссылка на контейнер чата для автопрокрутки
  const chatContainerRef = useRef(null)

  const handleFindNewPartner = () => {
    setConnectedRoom(null);
    setChatEnded(false);
    setChat([]);
    setIsRoomReady(false);
    setIsSearching(true);
    handleSearch(); // Чтобы показывалась форма поиска!
  }; 

  // функция для загрузки изображения и отправки его в чат
  const handleFileUpload = async (e) => {
    if (!connectedRoom) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${apiBase}/api/chat/${connectedRoom}/upload-photo`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      const data = await res.json();
      if (data.fileId) {
        // отправляем сокет-сообщение с imageId (текст пустой)
        socket.emit('message', { roomId: connectedRoom, text: '', imageId: data.fileId });
        // добавляем локально
        setChat(prev => [...prev, { text: '', from: mySocketId, imageId: data.fileId, timestamp: new Date() }]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const [isSearching, setIsSearching] = useState(false)
   // автопрокрутка вниз при появлении новых сообщений/системных сообщений
  useEffect(() => {
    if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
      }
    }, [chat, systemMessages])

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

    socket.on("message", ({ text, from, imageId }) => {
      setChat(prev => [...prev, { text, from, imageId: imageId ?? null, timestamp: new Date() }])
    })

    socket.on("chatEnded", () => {
      setIsRoomReady(false)
      setChatEnded(true)
      addSystemMessage("Собеседник отключился")
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
    setIsSearching(true);
    console.log("🔍 Ищем собеседника с параметрами:", { gender, ageGroup, seekingGender, seekingAgeGroups, adultMode, tag });
  
    if (tag.trim()) {
      socket.emit("join", {
        tag: tag.trim(),
        isAdult: adultMode
      });
    } else {
      socket.emit("join", {
        gender,
        ageGroup,
        seekingGender,
        seekingAgeGroups,
        isAdult: adultMode
      });
    }
  };

  // 📤 Отправка сообщения
  const handleSendMessage = () => {
    const trimmed = message.trim()
    if (trimmed === "") return
    socket.emit("message", { roomId: connectedRoom, text: trimmed })
    // добавляем локально с временной меткой
    setChat(prev => [...prev, { text: trimmed, from: mySocketId, imageId: null, timestamp: new Date() }])
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

    // отправка жалобы через REST API и вывод системного сообщения
  const handleComplain = async () => {
    if (connectedRoom) {
      try {
        await fetch("/api/complaints", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ roomId: connectedRoom })
        })
      } catch (err) {
        console.error(err)
      }
      addSystemMessage("Жалоба отправлена")
      setShowMore(false)
    }
  }

  // игнорирование собеседника: отправка события и завершение чата
  const handleIgnore = () => {
    if (connectedRoom) {
      socket.emit("ignoreUser", { roomId: connectedRoom })
      setIsRoomReady(false)
      setConnectedRoom(null)
      setChat([])
      setChatEnded(true)
      addSystemMessage("Собеседник игнорирован")
      setShowMore(false)
      setTimeout(() => handleSearch(), 1000)
    }
  }

  return (
    <div className="page-container">
      {/* экран поиска */}
      {!connectedRoom && (
        <>
          {isSearching ? (
            <div className="search-status">
              <span role="img" aria-label="search">🔍</span>
              <div>Ищем собеседника…</div>
              <div>Обычно это занимает несколько секунд</div>
            </div>
          ) : (
            <form className="search-form" onSubmit={e => { e.preventDefault(); handleSearch(); }}>
              <h1>Анонимный чат</h1>
              <FormRow label="Ваш пол:">
                <select value={gender} onChange={e => setGender(e.target.value)} style={inputStyle}>
                  <option value="m">♂️</option>
                  <option value="f">♀️</option>
                  <option value="any">👤</option>
                </select>
              </FormRow>
              <FormRow label="Кого ищете:">
                <select value={seekingGender} onChange={e => setSeekingGender(e.target.value)} style={inputStyle}>
                  <option value="m">♂️</option>
                  <option value="f">♀️</option>
                  <option value="any">👤</option>
                </select>
              </FormRow>
              <FormRow label="Возраст:">
                <select value={ageGroup} onChange={e => setAgeGroup(e.target.value)} style={inputStyle}>
                  <option value="18">18</option>
                  <option value="19-25">19–25</option>
                  <option value="26-35">26–35</option>
                  <option value="36+">36+</option>
                </select>
              </FormRow>
              <FormRow label="Ищу возраст:">
                {["18", "19-25", "26-35", "36+"].map(val => (
                  <label key={val} style={{ marginRight: 8 }}>
                    <input
                      type="checkbox"
                      checked={seekingAgeGroups.includes(val)}
                      onChange={e => {
                        if (e.target.checked) setSeekingAgeGroups(arr => [...arr, val]);
                        else setSeekingAgeGroups(arr => arr.filter(v => v !== val));
                      }}
                    />
                    {val}
                  </label>
                ))}
              </FormRow>
              <FormRow label="18+">
                <input
                  type="checkbox"
                  checked={adultMode}
                  onChange={() => {
                    if (!adultMode) {
                      const confirm18 = window.confirm("Подтверждая режим 18+, вы соглашаетесь с правилами и подтверждаете, что вам исполнилось 18 лет.");
                      if (!confirm18) return;
                    }
                    setAdultMode(prev => !prev);
                  }}
                />
                <span style={{ marginLeft: 4 }}>Включить</span>
              </FormRow>
              <FormRow label="Теги:">
                <input
                  type="text"
                  value={tag}
                  onChange={e => setTag(e.target.value)}
                  placeholder="Например: Москва, Игры"
                  style={inputStyle}
                />
              </FormRow>
              <button type="submit" style={buttonStyle}>🔍 Найти собеседника</button>
            </form>
          )}
        </>
      )}
      {/* экран чата */}
      {connectedRoom && (
        <>
          {chatEnded ? (
            <div className="chat-ended">
              <h2>Чат завершён!</h2>
              <button style={buttonStyle} onClick={handleFindNewPartner}>🔄 Найти нового собеседника</button>
              <button style={buttonStyle} onClick={() => saveChatAsHtml(chat, mySocketId)}>💾 Сохранить чат</button>
              <button style={buttonStyle} onClick={() => { setChatEnded(false); setConnectedRoom(null); setChat([]); }}>⚙️ Изменить параметры поиска</button>
            </div>
          ) : (
            <>
              <div className="top-bar">
                <span className="chat-title">Собеседник найден 🎯</span>
                <div className="action-buttons">
                  <button onClick={handleFindNewPartner}>🔄</button>
                  <button onClick={handleEndChat}>❌</button>
                  <button onClick={() => setShowMore(!showMore)}>⋯</button>
                </div>
              </div>
              {showMore && (
                <div className="more-menu">
                  <button onClick={handleComplain}>Пожаловаться</button>
                  <button onClick={handleIgnore}>Игнорировать</button>
                </div>
              )}
              <div ref={chatContainerRef} className="chat-container">
                {!isRoomReady && <div className="system-message">Ждём подключения…</div>}
                {systemMessages.map(sm => (
                  <div key={sm.id} className="system-message">{sm.text}</div>
                ))}
                {chat.map((msg, i) => (
                                    <div key={i} className={msg.from === mySocketId ? 'my-message-bubble' : 'partner-message-bubble'}>
                    {/* текст сообщения */}
                    {msg.text && <div>{msg.text}</div>}
                    {/* отображение прикреплённого изображения */}
                    {msg.imageId && (
                      <img
                        src={`${apiBase}/api/file/${msg.imageId}`}
                        alt="media"
                        className="chat-image"
                      />
                    )}
                    {msg.timestamp && (
                      <div className="timestamp">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="input-area">
                {/* скрытый input для выбора файла */}
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept="image/*"
                  onChange={handleFileUpload}
                />
                {/* кнопка прикрепления фото */}
                <button onClick={() => fileInputRef.current?.click()}>📎</button>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Введите сообщение..."
                />
                <button onClick={handleSendMessage}>📤</button>
              </div>
            </>
          )}
        </>
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