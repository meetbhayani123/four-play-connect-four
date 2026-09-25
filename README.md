# Four/Play — Connect Four

A small real-time multiplayer Connect Four game using Node.js, Express, and Socket.IO.

## Run locally

1. Install Node.js 18 or newer.
2. In this folder, run `npm install`.
3. Run `npm start`.
4. Open http://localhost:3000 in your browser.

To test across devices on the same Wi-Fi, open the app using your computer's local network address and port 3000 from both devices. For players in different places, deploy the app to Render using the steps in the project guide.

## Deploy to Render

This project includes a `render.yaml` Blueprint. On the Render Dashboard, choose **New → Blueprint**, connect this GitHub repository, then select **Deploy Blueprint**. Render reads the file and creates the Node.js web service with the included settings. When deployment finishes, open the service's `onrender.com` URL.

The free service can spin down after 15 minutes without traffic and may take about a minute to wake for the next visitor. Rooms are stored in server memory, so an ongoing game is cleared if the service restarts or spins down.

Room state lives in server memory. This is appropriate for a challenge/demo on one web service; rooms disappear when the service restarts. Keep a single running instance unless room storage is moved to a shared database.
