# Four/Play — Connect Four

A small real-time multiplayer Connect Four game using Node.js, Express, and Socket.IO.

## Run locally

1. Install Node.js 18 or newer.
2. In this folder, run `npm install`.
3. Run `npm start`.
4. Open http://localhost:3000 in your browser.

To test across devices on the same Wi-Fi, open the app using your computer's local network address and port 3000 from both devices. For players in different places, deploy the app to Render using the steps in the project guide.

## Deploy to Render

Create a GitHub repository containing this project, then on Render choose **New + → Web Service**, connect the repository, select **Node** as the runtime, use `npm install` for Build Command and `npm start` for Start Command. The free web service may sleep when idle; the next visit can take a short time to start.

Room state lives in server memory. This is appropriate for a challenge/demo on one web service; rooms disappear when the service restarts. Keep a single running instance unless room storage is moved to a shared database.
