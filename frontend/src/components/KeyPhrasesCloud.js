import React, { useMemo } from 'react';

function KeyPhrasesCloud({ documents }) {
  const words = useMemo(() => {
    const phraseCounts = {};
    
    documents.forEach((doc) => {
      try {
        const phrases = typeof doc.keyPhrases === 'string' 
          ? JSON.parse(doc.keyPhrases) 
          : doc.keyPhrases || [];
        
        phrases.forEach((phrase) => {
          const text = phrase.Text || phrase.text || phrase;
          if (text && text.length > 3) {
            phraseCounts[text] = (phraseCounts[text] || 0) + 1;
          }
        });
      } catch (e) {
        // Skip invalid data
      }
    });

    return Object.entries(phraseCounts)
      .map(([text, value]) => ({ text, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 30); // Top 30 phrases
  }, [documents]);

  if (words.length === 0) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>No key phrases available</div>;
  }

  // Simple visual word cloud using divs (no external dependency)
  return (
    <div style={{ width: '100%', minHeight: '300px', padding: '20px', display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
      {words.map((word, index) => {
        const fontSize = Math.max(12, Math.min(32, 12 + (word.value * 2)));
        const opacity = Math.min(1, 0.5 + (word.value * 0.1));
        return (
          <span
            key={index}
            style={{
              fontSize: `${fontSize}px`,
              fontWeight: 'bold',
              color: `rgba(0, 123, 255, ${opacity})`,
              padding: '4px 8px',
              borderRadius: '4px',
              backgroundColor: `rgba(0, 123, 255, ${opacity * 0.1})`,
            }}
            title={`Count: ${word.value}`}
          >
            {word.text}
          </span>
        );
      })}
    </div>
  );
}

export default KeyPhrasesCloud;

