import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

function EntityChart({ data }) {
  const chartData = Object.entries(data)
    .map(([name, value]) => ({
      name: name.replace('_', ' '),
      count: value,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Top 10

  if (chartData.length === 0) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>No entities extracted yet</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="count" fill="#8884d8" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default EntityChart;

