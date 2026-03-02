import React, { useState } from 'react';

const AIChatbot: React.FC = () => {
  const [userInput, setUserInput] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!userInput.trim()) return;

    setLoading(true);
    setError('');
    setAnswer('');

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userInput })
      });

      const data = await response.json();

      if (response.ok) {
        setAnswer(data.answer);
      } else {
        setError(data.error || 'Unexpected error occurred.');
      }
    } catch (err) {
      console.error('❌ Error fetching response:', err);
      setError('Server unreachable or internal error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif' }}>
      <h2>🧠 UPSC Semantic Assistant</h2>

      <textarea
        rows={6}
        cols={60}
        value={userInput}
        onChange={(e) => setUserInput(e.target.value)}
        placeholder="Ask your UPSC question..."
        style={{ marginBottom: '1rem', padding: '0.5rem', fontSize: '1rem' }}
      />

      <br />
      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{
          padding: '0.5rem 1rem',
          fontSize: '1rem',
          backgroundColor: '#007bff',
          color: '#fff',
          border: 'none',
          cursor: 'pointer'
        }}
      >
        {loading ? 'Thinking...' : 'Ask'}
      </button>

      {answer && (
        <div style={{ marginTop: '2rem', backgroundColor: '#f9f9f9', padding: '1rem' }}>
          <h3>📝 Answer:</h3>
          <p>{answer}</p>
        </div>
      )}

      {error && (
        <div style={{ marginTop: '2rem', color: 'red' }}>
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  );
};

export default AIChatbot;
