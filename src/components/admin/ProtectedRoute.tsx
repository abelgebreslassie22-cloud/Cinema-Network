import React from 'react';
import { Navigate } from 'react-router-dom';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAdmin = localStorage.getItem('isAdmin') === 'true';
  const token = localStorage.getItem('adminToken');
  
  if (!isAdmin || !token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
