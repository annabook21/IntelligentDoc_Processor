import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

function ProcessingTimeline({ data }) {
  // Group by date
  const dateGroups = {};
  data.forEach((item) => {
    const date = new Date(item.processingDate).toLocaleDateString();
    dateGroups[date] = (dateGroups[date] || 0) + 1;
  });

  const chartData = Object.entries(dateGroups)
    .map(([date, count]) => ({ date, documents: count }))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-10); // Last 10 days

  if (chartData.length === 0) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>No processing history</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" angle={-45} textAnchor="end" height={80} />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="documents" stroke="#8884d8" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default ProcessingTimeline;

