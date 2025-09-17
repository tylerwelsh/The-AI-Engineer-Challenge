'use client'

import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'

interface Message {
  id: string
  type: 'user' | 'assistant'
  content: string
  timestamp: Date
  sources_used?: number
}

interface ChatResponse {
  answer: string
  sources_used: number
  has_pdf: boolean
}

interface UploadResponse {
  message: string
  filename: string
  chunk_count: number
}

interface StatusResponse {
  status: string
  has_pdf: boolean
  pdf_filename: string | null
  chunk_count: number
  vector_db_ready: boolean
}

export default function ChatInterface() {
  const [apiKey, setApiKey] = useState('')
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showApiKeyInput, setShowApiKeyInput] = useState(true)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [pdfStatus, setPdfStatus] = useState<StatusResponse | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load API key from localStorage on component mount
  useEffect(() => {
    const savedApiKey = localStorage.getItem('openai_api_key')
    if (savedApiKey) {
      setApiKey(savedApiKey)
      setShowApiKeyInput(false)
      // Check PDF status when API key is loaded
      checkPdfStatus()
    }
  }, [])

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Check PDF status periodically
  useEffect(() => {
    if (!showApiKeyInput) {
      const interval = setInterval(checkPdfStatus, 10000) // Check every 10 seconds
      return () => clearInterval(interval)
    }
  }, [showApiKeyInput])

  // Save API key to localStorage
  const saveApiKey = () => {
    if (!apiKey.trim()) {
      toast.error('Please enter your OpenAI API key')
      return
    }
    localStorage.setItem('openai_api_key', apiKey)
    setShowApiKeyInput(false)
    checkPdfStatus()
    toast.success('API key saved!')
  }

  // Clear API key and show input again
  const clearApiKey = () => {
    localStorage.removeItem('openai_api_key')
    setApiKey('')
    setShowApiKeyInput(true)
    setPdfStatus(null)
    toast.success('API key cleared')
  }

  // Check current PDF status
  const checkPdfStatus = async () => {
    if (!apiKey.trim()) return

    try {
      const response = await fetch(`${getBackendUrl()}/api/status`)
      if (response.ok) {
        const status: StatusResponse = await response.json()
        setPdfStatus(status)
      }
    } catch (error) {
      console.error('Error checking PDF status:', error)
    }
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

  // Handle PDF file upload
  const handlePdfUpload = async (file: File) => {
    if (!apiKey.trim()) {
      toast.error('Please set your OpenAI API key first')
      setShowApiKeyInput(true)
      return
    }

    setIsUploading(true)
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('api_key', apiKey)

      const response = await fetch(`${getBackendUrl()}/api/upload-pdf`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Upload failed')
      }

      const uploadResponse: UploadResponse = await response.json()
      toast.success(`PDF uploaded: ${uploadResponse.filename}`)
      
      // Clear messages when new PDF is uploaded
      setMessages([])
      
      // Refresh status
      await checkPdfStatus()
      
    } catch (error) {
      console.error('Error uploading PDF:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to upload PDF')
    } finally {
      setIsUploading(false)
      setPdfFile(null)
    }
  }

  // Handle drag and drop events
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const files = Array.from(e.dataTransfer.files)
    const pdfFile = files.find(file => file.type === 'application/pdf')
    
    if (pdfFile) {
      setPdfFile(pdfFile)
      handlePdfUpload(pdfFile)
    } else {
      toast.error('Please drop a PDF file')
    }
  }

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type === 'application/pdf') {
      setPdfFile(file)
      handlePdfUpload(file)
    } else {
      toast.error('Please select a PDF file')
    }
  }

  // Clear current PDF
  const clearPdf = async () => {
    try {
      await fetch(`${getBackendUrl()}/api/pdf`, { method: 'DELETE' })
      setPdfStatus(null)
      setMessages([])
      toast.success('PDF cleared')
    } catch (error) {
      toast.error('Failed to clear PDF')
    }
  }

  // Send RAG chat request to backend
  const sendMessage = async () => {
    if (!question.trim()) {
      toast.error('Please enter a question')
      return
    }

    if (!apiKey.trim()) {
      toast.error('Please set your OpenAI API key first')
      setShowApiKeyInput(true)
      return
    }

    if (!pdfStatus?.has_pdf) {
      toast.error('Please upload a PDF first')
      return
    }

    setIsLoading(true)

    // Add user question to chat
    const userMessage: Message = {
      id: Date.now().toString() + '_user',
      type: 'user',
      content: question,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])

    try {
      const response = await fetch(`${getBackendUrl()}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: question,
          model: 'gpt-4o-mini',
          api_key: apiKey
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`)
      }

      const chatResponse: ChatResponse = await response.json()

      // Add assistant response
      const assistantMessage: Message = {
        id: Date.now().toString() + '_assistant',
        type: 'assistant',
        content: chatResponse.answer,
        timestamp: new Date(),
        sources_used: chatResponse.sources_used
      }

      setMessages(prev => [...prev, assistantMessage])
      
      // Clear input field
      setQuestion('')
      
      // Update PDF status to refresh chunk count if needed
      await checkPdfStatus()
      
    } catch (error) {
      console.error('Error sending message:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to send message. Please check your connection and API key.')
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
            RAG PDF Chat Interface
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
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold text-white">RAG PDF Chat Interface</h1>
            <div className="space-x-2">
              <button
                onClick={clearMessages}
                className="bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-lg transition-colors"
              >
                Clear Chat
              </button>
              {pdfStatus?.has_pdf && (
                <button
                  onClick={clearPdf}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Clear PDF
                </button>
              )}
              <button
                onClick={clearApiKey}
                className="bg-primary-darker hover:bg-primary-dark text-white px-4 py-2 rounded-lg transition-colors"
              >
                Change API Key
              </button>
            </div>
          </div>
          
          {/* PDF Status Bar */}
          <div className="bg-primary-darker p-3 rounded-lg">
            {pdfStatus?.has_pdf ? (
              <div className="flex items-center justify-between text-white text-sm">
                <div className="flex items-center space-x-4">
                  <span className="text-green-400">📄 PDF Loaded:</span>
                  <span className="font-medium">{pdfStatus.pdf_filename}</span>
                  {pdfStatus.chunk_count > 0 && (
                    <span className="text-gray-300">
                      ({pdfStatus.chunk_count} chunks indexed)
                    </span>
                  )}
                  {pdfStatus.vector_db_ready ? (
                    <span className="text-green-400">✓ Ready for questions</span>
                  ) : (
                    <span className="text-yellow-400">⏳ Processing...</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-gray-300 text-sm mb-2">No PDF uploaded yet</p>
                <div
                  className={`border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer ${
                    isDragOver 
                      ? 'border-primary bg-primary/10' 
                      : 'border-gray-500 hover:border-primary hover:bg-primary/5'
                  }`}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="text-center">
                    <p className="text-white text-sm mb-1">
                      {isUploading ? 'Uploading...' : 'Drop a PDF file here or click to browse'}
                    </p>
                    <p className="text-gray-400 text-xs">
                      Maximum file size: 50MB
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={isUploading}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-custom">
        <div className="max-w-6xl mx-auto space-y-4">
          {messages.length === 0 && pdfStatus?.has_pdf && (
            <div className="text-center text-gray-400 py-8">
              <p className="text-lg mb-2">Ask questions about your PDF!</p>
              <p className="text-sm">
                I can only answer based on the content in the uploaded document.
              </p>
            </div>
          )}
          
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.type === 'assistant' ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-xs lg:max-w-2xl px-4 py-3 rounded-lg ${
                  message.type === 'user'
                    ? 'bg-primary text-white'
                    : 'bg-primary-darkest text-white'
                }`}
              >
                <div className="text-xs opacity-75 mb-1 capitalize flex items-center justify-between">
                  <span>{message.type}</span>
                  {message.type === 'assistant' && message.sources_used !== undefined && (
                    <span className="text-green-400">
                      {message.sources_used} source{message.sources_used !== 1 ? 's' : ''} used
                    </span>
                  )}
                </div>
                <div className="whitespace-pre-wrap">{message.content}</div>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-primary-darkest text-white px-4 py-3 rounded-lg">
                <div className="text-xs opacity-75 mb-1">Assistant</div>
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Searching PDF and generating answer...</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-primary-darkest p-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex space-x-4">
            <div className="flex-1">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={pdfStatus?.has_pdf ? "Ask a question about the PDF..." : "Please upload a PDF first"}
                className="w-full px-4 py-3 bg-background text-white border border-primary rounded-lg focus:outline-none focus:border-primary-dark resize-none"
                rows={2}
                disabled={!pdfStatus?.has_pdf || isLoading}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
              />
              <div className="flex justify-between items-center mt-2">
                <p className="text-gray-400 text-xs">
                  {pdfStatus?.has_pdf 
                    ? "Press Enter to send, Shift+Enter for new line" 
                    : "Upload a PDF to start asking questions"
                  }
                </p>
                {pdfStatus?.has_pdf && (
                  <p className="text-gray-400 text-xs">
                    {pdfStatus.chunk_count} chunks available for search
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={sendMessage}
              disabled={isLoading || !pdfStatus?.has_pdf || !question.trim()}
              className={`px-6 py-3 rounded-lg font-medium text-white transition-colors self-start ${
                isLoading || !pdfStatus?.has_pdf || !question.trim()
                  ? 'bg-primary-darker cursor-not-allowed'
                  : 'bg-primary hover:bg-primary-dark'
              }`}
            >
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Asking...</span>
                </div>
              ) : (
                'Ask Question'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
} 