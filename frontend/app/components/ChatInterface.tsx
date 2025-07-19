'use client'

import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'

interface Message {
  id: string
  type: 'developer' | 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ChatResponse {
  response: string
}

export default function ChatInterface() {
  const [apiKey, setApiKey] = useState('')
  const [developerMessage, setDeveloperMessage] = useState('')
  const [userMessage, setUserMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showApiKeyInput, setShowApiKeyInput] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load API key from localStorage on component mount
  useEffect(() => {
    const savedApiKey = localStorage.getItem('openai_api_key')
    if (savedApiKey) {
      setApiKey(savedApiKey)
      setShowApiKeyInput(false)
    }
  }, [])

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Save API key to localStorage
  const saveApiKey = () => {
    if (!apiKey.trim()) {
      toast.error('Please enter your OpenAI API key')
      return
    }
    localStorage.setItem('openai_api_key', apiKey)
    setShowApiKeyInput(false)
    toast.success('API key saved!')
  }

  // Clear API key and show input again
  const clearApiKey = () => {
    localStorage.removeItem('openai_api_key')
    setApiKey('')
    setShowApiKeyInput(true)
    toast.success('API key cleared')
  }

  // Determine backend URL based on environment
  const getBackendUrl = () => {
    if (typeof window !== 'undefined') {
      // Check if we're in development
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:8000'
      }
      // For production, use the same domain (assuming monorepo deployment)
      return `${window.location.protocol}//${window.location.host}`
    }
    // Fallback - this shouldn't happen in browser
    return 'https://the-ai-engineer-challenge-ekgs62u6e-tylers-projects-99bfe70b.vercel.app'
  }

  // Send chat request to backend
  const sendMessage = async () => {
    if (!developerMessage.trim() && !userMessage.trim()) {
      toast.error('Please enter at least one message')
      return
    }

    if (!apiKey.trim()) {
      toast.error('Please set your OpenAI API key first')
      setShowApiKeyInput(true)
      return
    }

    setIsLoading(true)

    // Add user messages to chat
    const newMessages: Message[] = []
    if (developerMessage.trim()) {
      newMessages.push({
        id: Date.now().toString() + '_dev',
        type: 'developer',
        content: developerMessage,
        timestamp: new Date()
      })
    }
    if (userMessage.trim()) {
      newMessages.push({
        id: Date.now().toString() + '_user',
        type: 'user',
        content: userMessage,
        timestamp: new Date()
      })
    }

    setMessages(prev => [...prev, ...newMessages])

    try {
      const response = await fetch(`${getBackendUrl()}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          developer_message: developerMessage || '',
          user_message: userMessage || '',
          model: 'gpt-4.1-mini',
          api_key: apiKey
        })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const responseText = await response.text()

      // Add assistant response
      const assistantMessage: Message = {
        id: Date.now().toString() + '_assistant',
        type: 'assistant',
        content: responseText,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])
      
      // Clear input fields
      setDeveloperMessage('')
      setUserMessage('')
      
    } catch (error) {
      console.error('Error sending message:', error)
      toast.error('Failed to send message. Please check your connection and API key.')
    } finally {
      setIsLoading(false)
    }
  }

  // Clear all messages
  const clearMessages = () => {
    setMessages([])
    toast.success('Chat cleared')
  }

  if (showApiKeyInput) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-primary-darkest p-8 rounded-lg shadow-lg max-w-md w-full">
          <h1 className="text-2xl font-bold text-white mb-6 text-center">
            Tyler's AI Chat Interface
          </h1>
          <div className="space-y-4">
            <div>
              <label className="block text-white text-sm font-medium mb-2">
                OpenAI API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your OpenAI API key"
                className="w-full px-4 py-2 bg-background text-white border border-primary rounded-lg focus:outline-none focus:border-primary-dark"
                onKeyPress={(e) => e.key === 'Enter' && saveApiKey()}
              />
            </div>
            <button
              onClick={saveApiKey}
              className="w-full bg-primary hover:bg-primary-dark text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Save API Key
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-primary-darkest p-4 shadow-lg">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">Tyler's AI Chat Interface</h1>
          <div className="space-x-2">
            <button
              onClick={clearMessages}
              className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg transition-colors"
            >
              Clear Chat
            </button>
            <button
              onClick={clearApiKey}
              className="bg-primary-darker hover:bg-primary-dark text-white px-4 py-2 rounded-lg transition-colors"
            >
              Change API Key
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-custom">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.type === 'assistant' ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                  message.type === 'developer'
                    ? 'bg-primary text-white'
                    : message.type === 'user'
                    ? 'bg-primary-dark text-white'
                    : 'bg-primary-darkest text-white'
                }`}
              >
                <div className="text-xs opacity-75 mb-1 capitalize">
                  {message.type}
                </div>
                <div className="whitespace-pre-wrap">{message.content}</div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-primary-darkest text-white px-4 py-2 rounded-lg">
                <div className="text-xs opacity-75 mb-1">Assistant</div>
                <div>Thinking...</div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-primary-darkest p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-white text-sm font-medium mb-2">
                Developer Message (optional)
              </label>
              <textarea
                value={developerMessage}
                onChange={(e) => setDeveloperMessage(e.target.value)}
                placeholder="Enter system/developer message..."
                className="w-full px-4 py-2 bg-background text-white border border-primary rounded-lg focus:outline-none focus:border-primary-dark resize-none"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-white text-sm font-medium mb-2">
                User Message (optional)
              </label>
              <textarea
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
                placeholder="Enter user message..."
                className="w-full px-4 py-2 bg-background text-white border border-primary rounded-lg focus:outline-none focus:border-primary-dark resize-none"
                rows={3}
              />
            </div>
          </div>
          <div className="flex justify-center">
            <button
              onClick={sendMessage}
              disabled={isLoading}
              className={`px-8 py-3 rounded-lg font-medium text-white transition-colors ${
                isLoading
                  ? 'bg-primary-darker cursor-not-allowed'
                  : 'bg-primary hover:bg-primary-dark'
              }`}
            >
              {isLoading ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
} 