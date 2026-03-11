import React, { useState, useEffect } from 'react';
import './App.css';

const API_URL = 'http://localhost:8000/api';

function App() {
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeTimers, setActiveTimers] = useState({});
  const [view, setView] = useState('dashboard');
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', company: '',
    projectName: '', projectDesc: '', clientId: '', hourlyRate: '', deadline: ''
  });

  useEffect(() => {
    fetchClients();
    fetchProjects();
    // Проверяем активные таймеры
    const saved = localStorage.getItem('activeTimers');
    if (saved) setActiveTimers(JSON.parse(saved));
  }, []);

  const fetchClients = async () => {
    const res = await fetch(`${API_URL}/clients`);
    const data = await res.json();
    setClients(data);
  };

  const fetchProjects = async () => {
    const res = await fetch(`${API_URL}/projects`);
    const data = await res.json();
    setProjects(data);
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const addClient = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_URL}/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        company: formData.company
      })
    });
    if (res.ok) {
      alert('Клиент добавлен!');
      fetchClients();
      setFormData({ ...formData, name: '', email: '', phone: '', company: '' });
    }
  };

  const addProject = async (e) => {
    e.preventDefault();
    const res = await fetch(`${API_URL}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.projectName,
        description: formData.projectDesc,
        client_id: parseInt(formData.clientId),
        hourly_rate: parseFloat(formData.hourlyRate),
        deadline: formData.deadline || null
      })
    });
    if (res.ok) {
      alert('Проект создан!');
      fetchProjects();
      setFormData({
        ...formData,
        projectName: '', projectDesc: '', clientId: '', hourlyRate: '', deadline: ''
      });
    }
  };

  const startTimer = async (projectId) => {
    if (activeTimers[projectId]) {
      alert('Таймер уже запущен!');
      return;
    }
    const res = await fetch(`${API_URL}/time/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId })
    });
    const data = await res.json();
    if (res.ok) {
      const newTimers = { ...activeTimers, [projectId]: data.id };
      setActiveTimers(newTimers);
      localStorage.setItem('activeTimers', JSON.stringify(newTimers));
    }
  };

  const stopTimer = async (projectId) => {
    const entryId = activeTimers[projectId];
    if (!entryId) return;
    
    const res = await fetch(`${API_URL}/time/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry_id: entryId })
    });
    if (res.ok) {
      const newTimers = { ...activeTimers };
      delete newTimers[projectId];
      setActiveTimers(newTimers);
      localStorage.setItem('activeTimers', JSON.stringify(newTimers));
      fetchProjects(); // обновляем данные
    }
  };

  const exportCSV = async (projectId) => {
    window.open(`${API_URL}/export/project/${projectId}/csv`);
  };

  const updateStatus = async (projectId, status) => {
    await fetch(`${API_URL}/projects/${projectId}/status?status=${status}`, {
      method: 'PUT'
    });
    fetchProjects();
  };

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}ч ${m}м`;
  };

  const getStatusBadge = (status) => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      completed: 'bg-blue-100 text-blue-800',
      paused: 'bg-yellow-100 text-yellow-800'
    };
    const labels = {
      active: 'В работе',
      completed: 'Завершён',
      paused: 'Отложен'
    };
    return <span className={`px-2 py-1 rounded text-xs ${colors[status] || 'bg-gray-100'}`}>
      {labels[status] || status}
    </span>;
  };

  const getClientName = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    return client ? client.name : '—';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Навигация */}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-8 h-16 items-center">
            <button onClick={() => setView('dashboard')} 
              className={`px-3 py-2 ${view === 'dashboard' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}>
              📊 Дашборд
            </button>
            <button onClick={() => setView('clients')}
              className={`px-3 py-2 ${view === 'clients' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}>
              👥 Клиенты
            </button>
            <button onClick={() => setView('projects')}
              className={`px-3 py-2 ${view === 'projects' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}>
              📁 Проекты
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {view === 'dashboard' && (
          <div>
            <h1 className="text-3xl font-bold mb-8">📊 Дашборд</h1>
            
            {/* Календарь дедлайнов */}
            <div className="bg-white rounded-lg shadow p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4">📅 Ближайшие дедлайны</h2>
              <div className="space-y-2">
                {projects.filter(p => p.deadline && p.status !== 'completed')
                  .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
                  .slice(0, 5).map(p => (
                    <div key={p.id} className="flex justify-between items-center border-b pb-2">
                      <div>
                        <span className="font-medium">{p.name}</span>
                        <span className="text-sm text-gray-500 ml-2">({getClientName(p.client_id)})</span>
                      </div>
                      <span className="text-sm text-red-600">
                        {new Date(p.deadline).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Активные проекты */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">⏳ Активные проекты</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Проект</th>
                      <th className="text-left py-2">Клиент</th>
                      <th className="text-left py-2">Статус</th>
                      <th className="text-left py-2">Время</th>
                      <th className="text-left py-2">Заработано</th>
                      <th className="text-left py-2">Таймер</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.filter(p => p.status === 'active').map(p => (
                      <tr key={p.id} className="border-b hover:bg-gray-50">
                        <td className="py-3">{p.name}</td>
                        <td>{getClientName(p.client_id)}</td>
                        <td>{getStatusBadge(p.status)}</td>
                        <td>{formatTime(p.total_time || 0)}</td>
                        <td>${(p.total_earned || 0).toFixed(2)}</td>
                        <td>
                          {activeTimers[p.id] ? (
                            <button onClick={() => stopTimer(p.id)}
                              className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600">
                              ⏹️ Стоп
                            </button>
                          ) : (
                            <button onClick={() => startTimer(p.id)}
                              className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600">
                              ⏯️ Старт
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {view === 'clients' && (
          <div>
            <h1 className="text-3xl font-bold mb-8">👥 Клиенты</h1>
            
            {/* Форма добавления */}
            <div className="bg-white rounded-lg shadow p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4">➕ Новый клиент</h2>
              <form onSubmit={addClient} className="grid grid-cols-2 gap-4">
                <input type="text" name="name" placeholder="Имя*" required
                  value={formData.name} onChange={handleInputChange}
                  className="border rounded px-3 py-2" />
                <input type="email" name="email" placeholder="Email*" required
                  value={formData.email} onChange={handleInputChange}
                  className="border rounded px-3 py-2" />
                <input type="tel" name="phone" placeholder="Телефон*" required
                  value={formData.phone} onChange={handleInputChange}
                  className="border rounded px-3 py-2" />
                <input type="text" name="company" placeholder="Компания"
                  value={formData.company} onChange={handleInputChange}
                  className="border rounded px-3 py-2" />
                <button type="submit" className="col-span-2 bg-blue-500 text-white py-2 rounded hover:bg-blue-600">
                  Добавить клиента
                </button>
              </form>
            </div>

            {/* Список клиентов */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">📋 Все клиенты</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Имя</th>
                      <th className="text-left py-2">Email</th>
                      <th className="text-left py-2">Телефон</th>
                      <th className="text-left py-2">Компания</th>
                      <th className="text-left py-2">Проектов</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map(c => (
                      <tr key={c.id} className="border-b hover:bg-gray-50">
                        <td className="py-3">{c.name}</td>
                        <td>{c.email}</td>
                        <td>{c.phone}</td>
                        <td>{c.company || '—'}</td>
                        <td>{c.projects?.length || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {view === 'projects' && (
          <div>
            <h1 className="text-3xl font-bold mb-8">📁 Проекты</h1>
            
            {/* Форма создания */}
            <div className="bg-white rounded-lg shadow p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4">➕ Новый проект</h2>
              <form onSubmit={addProject} className="grid grid-cols-2 gap-4">
                <input type="text" name="projectName" placeholder="Название*" required
                  value={formData.projectName} onChange={handleInputChange}
                  className="border rounded px-3 py-2 col-span-2" />
                <textarea name="projectDesc" placeholder="Описание"
                  value={formData.projectDesc} onChange={handleInputChange}
                  className="border rounded px-3 py-2 col-span-2" rows="3" />
                <select name="clientId" required value={formData.clientId} onChange={handleInputChange}
                  className="border rounded px-3 py-2">
                  <option value="">Выберите клиента*</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input type="number" name="hourlyRate" placeholder="Ставка $/час*" required
                  value={formData.hourlyRate} onChange={handleInputChange}
                  className="border rounded px-3 py-2" />
                <input type="datetime-local" name="deadline" placeholder="Дедлайн"
                  value={formData.deadline} onChange={handleInputChange}
                  className="border rounded px-3 py-2" />
                <button type="submit" className="col-span-2 bg-green-500 text-white py-2 rounded hover:bg-green-600">
                  Создать проект
                </button>
              </form>
            </div>

            {/* Все проекты */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">📋 Все проекты</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Проект</th>
                      <th className="text-left py-2">Клиент</th>
                      <th className="text-left py-2">Статус</th>
                      <th className="text-left py-2">Ставка</th>
                      <th className="text-left py-2">Время</th>
                      <th className="text-left py-2">Заработано</th>
                      <th className="text-left py-2">Дедлайн</th>
                      <th className="text-left py-2">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map(p => (
                      <tr key={p.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 font-medium">{p.name}</td>
                        <td>{getClientName(p.client_id)}</td>
                        <td>{getStatusBadge(p.status)}</td>
                        <td>${p.hourly_rate}/ч</td>
                        <td>{formatTime(p.total_time || 0)}</td>
                        <td>${(p.total_earned || 0).toFixed(2)}</td>
                        <td>{p.deadline ? new Date(p.deadline).toLocaleDateString() : '—'}</td>
                        <td>
                          <div className="flex space-x-2">
                            <select onChange={(e) => updateStatus(p.id, e.target.value)} 
                              value={p.status} className="text-xs border rounded p-1">
                              <option value="active">В работе</option>
                              <option value="completed">Завершён</option>
                              <option value="paused">Отложен</option>
                            </select>
                            <button onClick={() => exportCSV(p.id)}
                              className="bg-gray-500 text-white px-2 py-1 rounded text-xs">
                              📥 CSV
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Темная тема через класс на body */}
      <button onClick={() => document.body.classList.toggle('dark')}
        className="fixed bottom-4 right-4 bg-gray-800 text-white p-3 rounded-full shadow-lg">
        🌙
      </button>
    </div>
  );
}

export default App;