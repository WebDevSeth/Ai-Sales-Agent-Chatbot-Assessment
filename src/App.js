/* global __app_id, __firebase_config, __initial_auth_token */
import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore'; // Import Firestore functions

function App() {
    // State variables for managing chat messages, user input, loading status, and UI modals
    const [messages, setMessages] = useState([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showIntroModal, setShowIntroModal] = useState(true);
    const [isFirebaseReady, setIsFirebaseReady] = useState(false); // New state to track Firebase readiness

    // State variables for Firebase authentication and database instances
    // eslint-disable-next-line no-unused-vars
    const [auth, setAuth] = useState(null); // Firebase Auth instance
    // eslint-disable-next-line no-unused-vars
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
        // The following globals (__app_id, __firebase_config, __initial_auth_token) are provided by the Canvas environment.
        // When running locally, these will be `undefined`.
        // FOR LOCAL DEVELOPMENT AND NETLIFY DEPLOYMENT: This block now uses your actual Firebase project's config.
        let firebaseConfig = {}; // Default empty
        if (typeof __firebase_config !== 'undefined' && __firebase_config) {
            // This path is for when running within the Canvas environment (e.g., when I provide the code)
            try {
                firebaseConfig = JSON.parse(__firebase_config);
            } catch (error) {
                console.error("Error parsing __firebase_config:", error);
            }
        } else {
            // This path is for when running LOCALLY (npm start or netlify dev) OR DEPLOYED TO NETLIFY
            // This is your actual Firebase project configuration from your Firebase Console.
            firebaseConfig = {
                apiKey: "AIzaSyDNzQKc6UIlKcWyYw36OexeQrYTMkO4F_U",
                authDomain: "nex-agent-test.firebaseapp.com",
                projectId: "nex-agent-test",
                storageBucket: "nex-agent-test.firebasestorage.app",
                messagingSenderId: "835940254767",
                appId: "1:835940254767:web:3e01fc7d8da953eaa672da",
                measurementId: "G-K72L3Y83XX"
            };
            console.warn("Using hardcoded Firebase config for local development and Netlify deployment. Ensure this is your actual project config.");
        }


        try {
            const app = initializeApp(firebaseConfig); // Initialize with your provided config
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);

            setAuth(authInstance);
            setDb(dbInstance);

            const unsubscribeAuth = onAuthStateChanged(authInstance, async (user) => {
                if (user) {
                    setUserId(user.uid);
                    setIsFirebaseReady(true); // Firebase is ready once user is authenticated
                    console.log("Firebase user signed in:", user.uid);
                } else {
                    console.log("No Firebase user signed in. Attempting anonymous sign-in.");
                    try {
                        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
                        if (initialAuthToken) {
                            await signInWithCustomToken(authInstance, initialAuthToken);
                            console.log("Signed in with custom token.");
                        } else {
                            // Attempt anonymous sign-in only if firebaseConfig actually has a projectId
                            // Otherwise, it will silently fail or throw.
                            if (firebaseConfig && firebaseConfig.projectId) { // Check if config is valid before attempting sign-in
                                await signInAnonymously(authInstance);
                                console.log("Signed in anonymously.");
                            } else {
                                console.warn("Firebase projectId not found in config. Anonymous sign-in skipped for local development.");
                            }
                        }
                    } catch (error) {
                        console.error("Firebase authentication error:", error);
                    }
                }
            });

            return () => unsubscribeAuth(); // Cleanup auth listener
        } catch (error) {
            // This catch block handles errors from initializeApp if firebaseConfig is invalid
            console.error("Failed to initialize Firebase app. Check firebaseConfig:", error);
            // Keep isFirebaseReady false if initialization fails, which keeps input disabled
            setIsFirebaseReady(false); // Explicitly set to false on init error
        }
    }, []);

    // Firestore Listener for Chat History
    useEffect(() => {
        if (db && userId && isFirebaseReady) {
            // eslint-disable-next-line no-unused-vars
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            // Firestore path for private user data: /artifacts/{appId}/users/{userId}/chatHistory
            const chatCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/chatHistory`);
            // Order by timestamp to maintain message order
            const q = query(chatCollectionRef, orderBy('timestamp', 'asc'));

            const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
                const fetchedMessages = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setMessages(fetchedMessages);
                console.log("Chat history fetched:", fetchedMessages);
            }, (error) => {
                console.error("Error fetching chat history from Firestore:", error);
            });

            return () => unsubscribeSnapshot(); // Cleanup snapshot listener
        }
    }, [db, userId, isFirebaseReady]); // Dependencies for this effect

    // Effect to scroll to the latest message whenever messages state changes
    useEffect(() => {
        // Fix for typo: scrollIntoView
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Function to handle sending a message
    const sendMessage = async (e) => {
        e.preventDefault(); // Prevent default form submission behavior
        if (userInput.trim() === '' || isLoading || !isFirebaseReady) return; // Don't send empty messages or if loading or Firebase not ready

        const newUserMessage = {
            text: userInput,
            sender: 'user',
            timestamp: serverTimestamp() // Add server timestamp
        };

        // Update local state immediately for responsiveness
        setMessages((prevMessages) => [...prevMessages, newUserMessage]);
        setUserInput('');
        setIsLoading(true);

        try {
            // Save user message to Firestore
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const chatCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/chatHistory`);
            await addDoc(chatCollectionRef, newUserMessage);
            console.log("User message saved to Firestore.");

            // Prepare chat history for the AI, including the role prompt and previous messages
            // The history for startChat should contain everything *before* the current turn.
            let chatHistoryForAI = [{ role: "user", parts: [{ text: aiRolePrompt }] }];
            messages.forEach(msg => {
                chatHistoryForAI.push({
                    role: msg.sender === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.text }]
                });
            });
            chatHistoryForAI.push({ role: "user", parts: [{ text: userInput }] }); // Add the current user input for AI

            // Make a fetch call to the Netlify Function (serverless endpoint)
            const response = await fetch('/.netlify/functions/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chatHistory: chatHistoryForAI, // Send the full history for context
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 800,
                    },
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("Netlify Function error (response not OK):", response.status, response.statusText, errorData);
                throw new Error(`Netlify Function error: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();

            if (result.aiResponseText) {
                const newAiMessage = {
                    text: result.aiResponseText,
                    sender: 'ai',
                    timestamp: serverTimestamp() // Add server timestamp
                };
                // Save AI message to Firestore
                await addDoc(chatCollectionRef, newAiMessage);
                console.log("AI message saved to Firestore.");
                // State update will happen via Firestore listener (onSnapshot)
            } else {
                console.error("Unexpected response from Netlify Function (missing aiResponseText):", result);
                const errorMessage = { text: "I'm sorry, I couldn't generate a response. Please try again.", sender: 'ai', timestamp: serverTimestamp() };
                await addDoc(chatCollectionRef, errorMessage); // Save error message
            }

        } catch (error) {
            console.error("Error communicating with AI or Firestore:", error);
            const errorMessage = { text: "There was an error connecting to the AI. Please check your console for details and try again.", sender: 'ai', timestamp: serverTimestamp() };
            if (db && userId) { // Only attempt to save if Firebase is initialized
                const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
                const chatCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/chatHistory`);
                await addDoc(chatCollectionRef, errorMessage);
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Function to reset the chat and show the intro modal
    const resetChat = async () => {
        // Clear local messages immediately
        setMessages([]);
        setUserInput('');
        setIsLoading(false);
        setShowIntroModal(true);

        // Optionally, clear chat history from Firestore for the current user
        // This is more complex as you'd need to fetch all docs and delete them.
        // For simplicity in this example, we'll just clear the local state
        // and let the new session start fresh on UI. Past chat history
        // would still be in Firestore unless explicitly deleted.
        // If full reset including Firestore deletion is desired, you'd add:
        // const q = query(collection(db, `artifacts/${appId}/users/${userId}/chatHistory`));
        // const snapshot = await getDocs(q);
        // snapshot.docs.forEach(async (doc) => { await deleteDoc(doc.ref); });
        console.log("Chat reset locally. Firestore history remains unless explicitly cleared.");
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
    const closeModal = async () => {
        setShowIntroModal(false);
        // Add initial AI message to Firestore, which will then update local state via listener
        if (db && userId) {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const chatCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/chatHistory`);
            const initialAiMessage = {
                text: "Thompson's Trinkets, Mr./Ms. Thompson speaking. How can I help you?",
                sender: 'ai',
                timestamp: serverTimestamp()
            };
            await addDoc(chatCollectionRef, initialAiMessage);
            console.log("Initial AI message saved to Firestore.");
        } else {
            // Fallback for local testing where Firebase might not be fully ready
            setMessages([{ text: "Thompson's Trinkets, Mr./Ms. Thompson speaking. How can I help you?", sender: 'ai' }]);
        }
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
                        disabled={isLoading || !isFirebaseReady}
                    />
                    <button
                        type="submit"
                        className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition duration-200 ease-in-out disabled:opacity-50"
                        disabled={isLoading || !isFirebaseReady}
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
                <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
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
