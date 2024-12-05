import * as THREE from "../../libs/three125/three.module.js";
import { GLTFLoader } from "../../libs/three/jsm/GLTFLoader.js";
import { RGBELoader } from "../../libs/three/jsm/RGBELoader.js";

class App {
  constructor() {
    this.assetsPath = "../../assets/ar-shop/";
    this.chair = null;

    // MindAR Event Binding
    document.querySelector("a-scene").addEventListener("targetFound", () => {
      console.log("Image detected!");
      document.getElementById("ar-button").style.display = "block";
    });

    document.querySelector("a-scene").addEventListener("targetLost", () => {
      console.log("Image lost!");
      document.getElementById("ar-button").style.display = "none";
    });
  }

  startAR() {
    console.log("Starting AR session...");
    this.initAR();
  }

  initAR() {
    // Create Three.js renderer and camera
    const container = document.createElement("div");
    document.body.appendChild(container);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );

    this.scene = new THREE.Scene();

    // Reticle
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.15, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x00ff00 })
    );
    this.reticle.visible = false;
    this.scene.add(this.reticle);

    // Add lighting
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    this.scene.add(light);

    // Set up AR session
    this.renderer.xr.enabled = true;
    navigator.xr.requestSession("immersive-ar", { requiredFeatures: ["hit-test"] }).then((session) => {
      this.renderer.xr.setSession(session);

      const controller = this.renderer.xr.getController(0);
      this.scene.add(controller);

      controller.addEventListener("select", () => {
        if (this.reticle.visible && this.chair) {
          this.chair.position.setFromMatrixPosition(this.reticle.matrix);
          this.chair.visible = true;
        }
      });

      session.addEventListener("end", () => {
        console.log("AR session ended");
      });

      this.setupHitTest(session);
      this.loadChair();
      this.renderer.setAnimationLoop(this.render.bind(this));
    });
  }

  setupHitTest(session) {
    const viewerSpace = session.requestReferenceSpace("viewer");
    session
      .requestHitTestSource({ space: viewerSpace })
      .then((source) => {
        this.hitTestSource = source;
      });

    session.addEventListener("end", () => {
      this.hitTestSource = null;
    });
  }

  loadChair() {
    const loader = new GLTFLoader().setPath(this.assetsPath);
    loader.load("chair.glb", (gltf) => {
      this.chair = gltf.scene;
      this.chair.visible = false;
      this.scene.add(this.chair);
    });
  }

  render(timestamp, frame) {
    if (this.hitTestSource && frame) {
      const hitTestResults = frame.getHitTestResults(this.hitTestSource);
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const referenceSpace = this.renderer.xr.getReferenceSpace();
        const pose = hit.getPose(referenceSpace);
        this.reticle.matrix.fromArray(pose.transform.matrix);
        this.reticle.visible = true;
      } else {
        this.reticle.visible = false;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

export { App };
