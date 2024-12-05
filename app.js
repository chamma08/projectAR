import * as THREE from "./libs/three125/three.module.js";
import { GLTFLoader } from "./libs/three/jsm/GLTFLoader.js";
import { RGBELoader } from "./libs/three/jsm/RGBELoader.js";
import { ARButton } from "./libs/ARButton.js";

class App {
  constructor() {
    const container = document.createElement("div");
    document.body.appendChild(container);

    this.assetsPath = "./assets/";
    this.chair = null;

    // Initialize Three.js
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      20
    );
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.xr.enabled = true;
    container.appendChild(this.renderer.domElement);

    // Light
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    light.position.set(0.5, 1, 0.25);
    this.scene.add(light);

    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x0ff000 })
    );
    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
    this.scene.add(this.reticle);

    // AR Button
    this.button = ARButton.createButton(this.renderer, {
      requiredFeatures: ["hit-test"],
    });
    document.body.appendChild(this.button);

    this.setupXR();
    window.addEventListener("resize", this.resize.bind(this));
  }

  setupXR() {
    const self = this;
    this.hitTestSourceRequested = false;
    this.hitTestSource = null;

    this.renderer.xr.addEventListener("sessionstart", () => {
      const session = self.renderer.xr.getSession();
      session.addEventListener("select", self.onSelect.bind(self));
    });

    this.controller = this.renderer.xr.getController(0);
    this.scene.add(this.controller);
  }

  onSelect() {
    if (this.reticle.visible && this.chair) {
      this.chair.position.setFromMatrixPosition(this.reticle.matrix);
      this.chair.visible = true;
    }
  }

  loadChair() {
    const loader = new GLTFLoader().setPath(this.assetsPath);
    loader.load(
      "chair1.glb",
      (gltf) => {
        this.scene.add(gltf.scene);
        this.chair = gltf.scene;
        this.chair.visible = false;
      },
      undefined,
      (error) => console.error("Error loading model:", error)
    );
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render(timestamp, frame) {
    if (frame) {
      const session = this.renderer.xr.getSession();
      if (!this.hitTestSourceRequested) {
        session.requestReferenceSpace("viewer").then((referenceSpace) => {
          session
            .requestHitTestSource({ space: referenceSpace })
            .then((source) => {
              this.hitTestSource = source;
            });
        });

        session.addEventListener("end", () => {
          this.hitTestSourceRequested = false;
          this.hitTestSource = null;
        });

        this.hitTestSourceRequested = true;
      }

      if (this.hitTestSource) {
        const hitTestResults = frame.getHitTestResults(this.hitTestSource);
        if (hitTestResults.length) {
          const referenceSpace = this.renderer.xr.getReferenceSpace();
          const hit = hitTestResults[0];
          const pose = hit.getPose(referenceSpace);
          this.reticle.visible = true;
          this.reticle.matrix.fromArray(pose.transform.matrix);
        } else {
          this.reticle.visible = false;
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  start() {
    console.log("Starting AR session");
    this.renderer.setAnimationLoop(this.render.bind(this));
  }

  stop() {
    console.log("Stopping AR session");
    this.renderer.setAnimationLoop(null);
  }

  showChair() {
    this.loadChair();
    document.getElementById("model-ui").style.display = "flex";
    this.start();
  }

  exitAR() {
    document.getElementById("model-ui").style.display = "none";
    this.stop();
    this.chair = null;
  }
}

export { App };
