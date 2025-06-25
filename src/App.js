/* global __app_id, __firebase_config, __initial_auth_token */
import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

function App() {
    // State variables for managing chat messages, user input, loading status, and UI modals
    const [messages, setMessages] = useState([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showIntroModal, setShowIntroModal] = useState(true);

    // State variables for Firebase authentication and database instances
    const [auth, setAuth] = useState(null); // Firebase Auth instance
    const [db, setDb] = useState(null); // Firebase Firestore instance
    const [userId, setUserId] = useState(null); // User ID from Firebase Auth

    // Ref for automatically scrolling to the latest message
    const messagesEndRef = useRef(null);

    // AI role prompt for the chatbot persona
    const aiRolePrompt = `
        You are Mr./Ms. Thompson, the busy and somewhat skeptical owner of "Thompson's Trinkets," a small, established brick-and-mortar retail business selling handcrafted goods. You rely mostly on word-of-mouth and local advertising. You have a lot on your plate and view unsolicited calls as interruptions. You've heard promises from "digital marketing" companies before that didn't deliver. You are wary of spending money without clear, tangible returns and are concerned about the time commitment required for new marketing efforts.

        Your persona:
        - Busy and easily annoyed by generic sales pitches.
        - Skeptical of "digital solutions" but not entirely closed off if a clear, tangible benefit is presented without a huge time investment on your part.
        - Values concrete results over buzzwords.
        - Will raise objections like: "I'm too busy," "We're doing fine as we are," "I don't understand technology," "How much does it cost?", "I've tried these things before and they didn't work."
        - Your ultimate goal in this interaction is to brush off the caller unless they can genuinely intrigue you with a very specific, low-effort, high-impact benefit that aligns with your current pain points (even if you haven't explicitly stated them).
        - Do not agree to a follow-up meeting easily. The caller must earn it by demonstrating value and understanding your situation.

        You are about to receive a cold call from a sales representative from "Nexlify." Interact naturally as Mr./Ms. Thompson.
        If the sales agent asks for your contact details, politely decline for now, stating you're too busy and they need to impress you more first.
        If they directly ask for a meeting, make it clear they need to provide more compelling reasons for you to invest your time.
        Keep your responses concise and in character.
    `;

    // Firebase Initialization and Authentication
    useEffect(() => {
        // Retrieve app ID and Firebase config from global variables (provided by Canvas environment)
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

        try {
            // Initialize Firebase app with the provided configuration
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            setAuth(authInstance); // Set auth instance to state
            setDb(dbInstance); // Set firestore instance to state

            // Set up an authentication state listener
            const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                if (user) {
                    // If a user is signed in, set their UID
                    setUserId(user.uid);
                    console.log("Firebase user signed in:", user.uid);
                } else {
                    // If no user is signed in, attempt anonymous sign-in or custom token sign-in
                    console.log("No Firebase user signed in. Attempting anonymous sign-in.");
                    try {
                        // Check for an initial authentication token (from Canvas environment)
                        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
                        if (initialAuthToken) {
                            // Sign in with custom token if available
                            await signInWithCustomToken(authInstance, initialAuthToken);
                            console.log("Signed in with custom token.");
                        } else {
                            // Otherwise, sign in anonymously
                            await signInAnonymously(authInstance);
                            console.log("Signed in anonymously.");
                        }
                    } catch (error) {
                        console.error("Firebase authentication error:", error);
                    }
                }
            });

            // Clean up the authentication state listener on component unmount
            return () => unsubscribe();
        } catch (error) {
            console.error("Failed to initialize Firebase:", error);
        }
    }, []); // Empty dependency array ensures this effect runs only once on mount

    // Effect to scroll to the latest message whenever messages state changes
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Function to handle sending a message
    const sendMessage = async (e) => {
        e.preventDefault(); // Prevent default form submission behavior
        if (userInput.trim() === '' || isLoading) return; // Don't send empty messages or if loading

        // Add user message to the messages state
        const newUserMessage = { text: userInput, sender: 'user' };
        setMessages((prevMessages) => [...prevMessages, newUserMessage]);
        setUserInput(''); // Clear user input field
        setIsLoading(true); // Set loading state to true

        try {
            // Prepare chat history for the AI, including the role prompt and previous messages
            let chatHistory = [{ role: "user", parts: [{ text: aiRolePrompt }] }];
            messages.forEach(msg => {
                chatHistory.push({
                    role: msg.sender === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.text }]
                });
            });
            chatHistory.push({ role: "user", parts: [{ text: userInput }] }); // Add the current user input

            // Make a fetch call to the Netlify Function (serverless endpoint)
            // This endpoint will handle the interaction with the Gemini API
            const response = await fetch('/.netlify/functions/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chatHistory: chatHistory,
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 800,
                    },
                })
            });

            // Check if the response from the Netlify Function was successful
            if (!response.ok) {
                const errorData = await response.json();
                console.error("Netlify Function error (response not OK):", response.status, response.statusText, errorData);
                throw new Error(`Netlify Function error: ${response.status} ${response.statusText}`);
            }

            // Parse the JSON response from the Netlify Function
            const result = await response.json();

            // Add the AI's response to the messages state
            if (result.aiResponseText) {
                setMessages((prevMessages) => [...prevMessages, { text: result.aiResponseText, sender: 'ai' }]);
            } else {
                // Handle unexpected response structure from the Netlify Function
                console.error("Unexpected response from Netlify Function (missing aiResponseText):", result);
                setMessages((prevMessages) => [...prevMessages, { text: "I'm sorry, I couldn't generate a response. Please try again.", sender: 'ai' }]);
            }

        } catch (error) {
            // Handle any errors during the fetch or AI communication
            console.error("Error communicating with AI via Netlify Function:", error);
            setMessages((prevMessages) => [...prevMessages, { text: "There was an error connecting to the AI. Please check your console for details and try again.", sender: 'ai' }]);
        } finally {
            setIsLoading(false); // Reset loading state
        }
    };

    // Function to reset the chat and show the intro modal
    const resetChat = () => {
        setMessages([]);
        setUserInput('');
        setIsLoading(false);
        setShowIntroModal(true);
    };

    // Functional component for the Start Assessment button
    const StartButton = ({ onClick }) => (
        <button
            onClick={onClick}
            className="w-full sm:w-auto px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition duration-300 ease-in-out transform hover:scale-105"
        >
            Start Assessment
        </button>
    );

    // Function to close the intro modal and start the chat with an initial AI message
    const closeModal = () => {
        setShowIntroModal(false);
        setMessages([{ text: "Thompson's Trinkets, Mr./Ms. Thompson speaking. How can I help you?", sender: 'ai' }]);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 flex flex-col items-center p-4 font-inter">
            {/* Tailwind CSS and Google Fonts are loaded in public/index.html */}

            {/* Custom CSS for chat elements */}
            <style>
                {`
                body { font-family: 'Inter', sans-serif; }
                .chat-container {
                    background: white;
                    border-radius: 1.5rem;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    width: 100%;
                    max-width: 800px;
                    height: 80vh;
                    min-height: 500px;
                }
                .message-bubble {
                    padding: 0.75rem 1.25rem;
                    border-radius: 1.25rem;
                    max-width: 80%;
                }
                .message-user {
                    background-color: #6366f1;
                    color: white;
                    align-self: flex-end;
                    border-bottom-right-radius: 0.25rem;
                }
                .message-ai {
                    background-color: #e0e7ff;
                    color: #1f2937;
                    align-self: flex-start;
                    border-bottom-left-radius: 0.25rem;
                }
                .chat-input-area {
                    border-top: 1px solid #e5e7eb;
                    padding: 1rem;
                    display: flex;
                    gap: 0.75rem;
                }
                .message-scroll-area {
                    flex-grow: 1;
                    overflow-y: auto;
                    padding: 1rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                .action-buttons {
                    padding: 1rem;
                    display: flex;
                    justify-content: center;
                    gap: 1rem;
                    border-top: 1px solid #e5e7eb;
                }
                `}
            </style>

            <h1 className="text-4xl font-bold text-gray-800 mb-6 mt-4">Nexlify Sales Call Simulator</h1>

            <div className="chat-container">
                {/* Message display area */}
                <div className="message-scroll-area">
                    {messages.map((msg, index) => (
                        <div
                            key={index}
                            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div className={`message-bubble ${msg.sender === 'user' ? 'message-user' : 'message-ai'}`}>
                                {msg.text}
                            </div>
                        </div>
                    ))}
                    {/* Loading indicator for AI responses */}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="message-bubble message-ai animate-pulse">
                                Mr./Ms. Thompson is thinking...
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} /> {/* Ref for auto-scrolling */}
                </div>

                {/* Message input form */}
                <form onSubmit={sendMessage} className="chat-input-area">
                    <input
                        type="text"
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder="Type your response..."
                        className="flex-grow p-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition duration-200 ease-in-out disabled:opacity-50"
                    >
                        Send
                    </button>
                </form>

                {/* Action buttons (Reset Chat, User ID display) */}
                <div className="action-buttons">
                    <button
                        onClick={resetChat}
                        className="px-6 py-3 bg-red-500 text-white font-semibold rounded-lg shadow-lg hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition duration-300 ease-in-out transform hover:scale-105"
                    >
                        Reset Chat
                    </button>
                    {userId && (
                        <div className="text-sm text-gray-600 flex items-center justify-center p-2">
                            User ID: <span className="font-mono text-xs bg-gray-100 rounded px-2 py-1 ml-2">{userId}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Introductory Modal */}
            {showIntroModal && (
                <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-2xl p-8 max-w-2xl w-full text-center transform scale-100 transition-all duration-300 ease-in-out">
                        <h2 className="text-3xl font-bold text-gray-800 mb-4">Welcome to the Nexlify Sales Assessment!</h2>
                        <p className="text-lg text-gray-700 mb-6">
                            Your task is to conduct a **cold call** with Mr./Ms. Thompson, the owner of "Thompson's Trinkets."
                        </p>
                        <p className="text-md text-gray-600 mb-6">
                            **Your Goal:** Secure a follow-up meeting (e.g., a discovery call, a demo) to discuss how Nexlify can help their business thrive in the digital age.
                            Mr./Ms. Thompson is a busy, skeptical business owner who's been disappointed by digital marketing promises before. You need to identify their needs, handle objections, and clearly articulate Nexlify's value.
                        </p>
                        <p className="text-md text-gray-600 font-semibold mb-8">
                            Aim to complete the call within 10-15 minutes. Good luck!
                        </p>
                        <StartButton onClick={closeModal} />
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
