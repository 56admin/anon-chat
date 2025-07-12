import { useState, useEffect } from "react"
import { io } from "socket.io-client"

const socket = io("http://localhost:3001") // Адрес backend-сокета

function App() {
  const [gender, setGender] = useState("m")
  const [ageGroup, setAgeGroup] = useState("18-25")
  const [seekingGender, setSeekingGender] = useState("f")
  const [seekingAgeGroup, setSeekingAgeGroup] = useState("18-25")
  const [connectedRoom, setConnectedRoom] = useState(null)

  useEffect(() => {
    socket.on("joinRoom", ({ roomId }) => {
      setConnectedRoom(roomId)
    })

    return () => {
      socket.off("joinRoom")
    }
  }, [])

  const handleSearch = () => {
    socket.emit("join", {
      gender,
      ageGroup,
      seekingGender,
      seekingAgeGroup,
    })
  }

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
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
        </div>
      )}
    </div>
  )
}

export default App