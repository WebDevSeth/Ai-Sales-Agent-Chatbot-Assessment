// netlify/functions/chat.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async function(event, context) {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
            headers: { 'Allow': 'POST' }
        };
    }

    try {
        // Parse the request body
        const { chatHistory, generationConfig } = JSON.parse(event.body);

        // Retrieve the Gemini API key from Netlify environment variables
        // IMPORTANT: Replace 'YOUR_GEMINI_API_KEY' with the actual environment variable name
        // that you will set in Netlify.
        const apiKey = process.env.GEMINI_API_KEY; // This should be set in Netlify environment variables

        if (!apiKey) {
            console.error("GEMINI_API_KEY environment variable is not set.");
            return {
                statusCode: 500,
                body: JSON.stringify({ error: "Server configuration error: API key missing." })
            };
        }

        // Initialize Google Generative AI with your API key
        const genAI = new GoogleGenerativeAI(apiKey);
        // For text-only input, use the gemini-2.0-flash model
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        // Start a new chat session with the provided history
        // The chat history from the client will include the role prompt
        const chat = model.startChat({
            history: chatHistory.map(item => ({
                role: item.role,
                parts: item.parts
            })),
            generationConfig: generationConfig, // Apply generation configuration from client
        });

        // Send the last user message to the AI and get the response
        // The chatHistory already includes the last user message, so we just
        // call sendMessage to get the model's reply.
        // It's crucial to send the *last* user message as the prompt for the model
        // while the full history provides context. The history for startChat
        // should contain everything *before* the current turn.
        // For a new turn, the history in `startChat` should be everything up to
        // the point *before* the current user input.
        // The `sendMessage` call then sends the *current* user input.

        // Re-evaluate how chatHistory is sent. `startChat` takes initial history.
        // `sendMessage` takes the current message.
        // Let's refine the approach: chatHistory should be all *previous* messages.
        // The *last* message in the `chatHistory` array passed from the client
        // is actually the *current* message to be sent.

        // Extract the actual user message for this turn
        const currentPrompt = chatHistory[chatHistory.length - 1].parts[0].text;
        // The rest is history for the chat model
        const historyForModel = chatHistory.slice(0, chatHistory.length - 1);

        // Re-initialize chat with corrected history
        const refinedChat = model.startChat({
            history: historyForModel.map(item => ({
                role: item.role,
                parts: item.parts
            })),
            generationConfig: generationConfig,
        });

        const result = await refinedChat.sendMessage(currentPrompt);
        const response = await result.response;
        const aiResponseText = response.text(); // Get the AI's response text

        // Return the AI's response
        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ aiResponseText: aiResponseText }),
        };

    } catch (error) {
        console.error("Error in Netlify Function:", error);
        // Return an error response
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to generate AI response.", details: error.message }),
        };
    }
};
