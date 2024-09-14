const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const statusDiv = document.getElementById("status");
const blinkCounterDiv = document.getElementById("blinkCounter");

let detectionsInterval;
let isBlinking = false;
let isFacingCamera = true;
let lastBlinkTime = 0;
let earHistory = [];
let blinkCount = 0;

const blinkThreshold = 0.12; // Adjusted for better sensitivity
const blinkDuration = 3000; // 3 seconds
const facingThreshold = 0.35;
const rollingAverageCount = 50; // Increased for more stable average
const requiredBlinks = 3; // Blinks required for live face detection

async function loadModels() {
  try {
    await faceapi.nets.tinyFaceDetector.loadFromUri(
      "https://justadudewhohacks.github.io/face-api.js/models"
    );
    await faceapi.nets.faceLandmark68Net.loadFromUri(
      "https://justadudewhohacks.github.io/face-api.js/models"
    );
    console.log("Models loaded successfully");
  } catch (error) {
    console.error("Error loading models:", error);
    throw new Error(
      "Failed to load face-api.js models. Check console for details."
    );
  }
}

async function startVideo() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
    video.srcObject = stream;
    return new Promise((resolve) => {
      video.onloadedmetadata = () => {
        resolve(video);
      };
    });
  } catch (error) {
    console.error("Error starting video:", error);
    statusDiv.textContent =
      "Error: Couldn't access webcam. Please check permissions.";
    throw error;
  }
}

function calculateEAR(eye) {
  const verticalDist1 = distance(eye[1], eye[5]);
  const verticalDist2 = distance(eye[2], eye[4]);
  const horizontalDist = distance(eye[0], eye[3]);
  return (verticalDist1 + verticalDist2) / (2 * horizontalDist);
}

function distance(point1, point2) {
  return Math.sqrt(
    Math.pow(point1.x - point2.x, 2) + Math.pow(point1.y - point2.y, 2)
  );
}

function detectBlink(landmarks) {
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  const leftEAR = calculateEAR(leftEye);
  const rightEAR = calculateEAR(rightEye);
  const avgEAR = (leftEAR + rightEAR) / 2;

  earHistory.push(avgEAR);
  if (earHistory.length > rollingAverageCount) {
    earHistory.shift();
  }
  const rollingAvgEAR =
    earHistory.reduce((a, b) => a + b, 0) / earHistory.length;

  console.log("Average EAR:", avgEAR, "Rolling Average EAR:", rollingAvgEAR);

  if (avgEAR < rollingAvgEAR * (1 - blinkThreshold)) {
    if (!isBlinking) {
      isBlinking = true;
      lastBlinkTime = Date.now();
      blinkCount++; // Increment blink counter
      console.log("Blink detected, Blink Count:", blinkCount);
    }
  } else {
    isBlinking = false;
  }
}

function detectHeadRotation(landmarks) {
  const nose = landmarks.getNose()[0];
  const leftEye = landmarks.getLeftEye()[0];
  const rightEye = landmarks.getRightEye()[0];

  const faceWidth = distance(leftEye, rightEye);
  const noseOffset =
    Math.abs(nose.x - (leftEye.x + rightEye.x) / 2) / faceWidth;

  isFacingCamera = noseOffset < facingThreshold;
  console.log("Nose offset:", noseOffset, "Facing camera:", isFacingCamera);
}

async function detectFaces() {
  try {
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks();

    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (detections.length > 0) {
      const resizedDetections = faceapi.resizeResults(detections, {
        width: video.width,
        height: video.height,
      });
      faceapi.draw.drawDetections(overlay, resizedDetections);
      faceapi.draw.drawFaceLandmarks(overlay, resizedDetections);

      const landmarks = resizedDetections[0].landmarks;
      detectBlink(landmarks);
      detectHeadRotation(landmarks);

      const timeSinceLastBlink = Date.now() - lastBlinkTime;
      const isLive =
        timeSinceLastBlink < blinkDuration &&
        isFacingCamera &&
        blinkCount >= requiredBlinks;

      // Update status and blink count on the webpage
      blinkCounterDiv.textContent = `Blinks: ${blinkCount}`;
      console.log(
        "Is live: ",
        isLive,
        "Time since last blink: ",
        timeSinceLastBlink,
        "Is facing camera: ",
        isFacingCamera,
        "Blinks: ",
        blinkCount
      );

      // Stop video stream and detection once live face detected
      if (isLive) {
        stopVideo();
        statusDiv.textContent = "Live Face Detected - 3 Blinks Completed";
        return;
      }
    } else {
      statusDiv.textContent = "No Face Detected";
    }
  } catch (error) {
    console.error("Error in face detection:", error);
    statusDiv.textContent =
      "Error in face detection. Check console for details.";
  }
}

function stopVideo() {
  // Stop video stream
  const stream = video.srcObject;
  const tracks = stream.getTracks();

  tracks.forEach((track) => track.stop());
  clearInterval(detectionsInterval); // Stop the detection interval
  console.log("Video stream stopped");
}

async function init() {
  try {
    console.log("Loading models...");
    await loadModels();
    console.log("Models loaded successfully");

    console.log("Starting video...");
    await startVideo();
    console.log("Video started successfully");

    overlay.width = video.width;
    overlay.height = video.height;

    console.log("Setting up detection interval...");
    detectionsInterval = setInterval(detectFaces, 100);
    console.log("Detection interval set up");
  } catch (error) {
    console.error("Initialization error:", error);
    if (statusDiv) {
      statusDiv.textContent = "Error: " + error.message;
    } else {
      console.error("Status div not found");
    }
  }
}

document.addEventListener("DOMContentLoaded", init);
