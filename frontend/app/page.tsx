'use client'

import { useState, useEffect } from 'react'
import ChatInterface from './components/ChatInterface'

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <ChatInterface />
    </main>
  )
} 