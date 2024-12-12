import * as THREE from "../../libs/three125/three.module.js";
import { GLTFLoader } from "../../libs/three/jsm/GLTFLoader.js";
import { RGBELoader } from "../../libs/three/jsm/RGBELoader.js";
import { OrbitControls } from "../../libs/three/jsm/OrbitControls.js";
import { ARButton } from "../../libs/ARButton.js";
import { LoadingBar } from "../../libs/LoadingBar.js";

class App {
  constructor() {
    const container = document.createElement("div");
    document.body.appendChild(container);

    this.loadingBar = new LoadingBar();
    this.loadingBar.visible = false;

    this.assetsPath = "../../assets/ar-shop/";

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.01,
      20
    );
    this.camera.position.set(0, 1.6, 0);

    this.scene = new THREE.Scene();

    const ambient = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    ambient.position.set(0.5, 1, 0.25);
    this.scene.add(ambient);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();

    this.setEnvironment();

    this.reticle = new THREE.Mesh(
      new THREE.RingBufferGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial()
    );

    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
    this.scene.add(this.reticle);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.minPolarAngle = Math.PI / 4;
    this.controls.maxPolarAngle = Math.PI / 2;

    this.setupXR();

    window.addEventListener("resize", this.resize.bind(this));

    this.arInterface = document.getElementById("ar-interface");
    this.backButton = document.getElementById("back-button");
    this.modelDescription = document.getElementById("model-description");

    // Ensure back button and description are hidden initially
    this.backButton.style.display = "none";
    this.modelDescription.parentElement.style.display = "none";

    // Event Listener for Back Button
    this.backButton.addEventListener("click", () => {
      this.exitAR();
    });
  }

  setupXR() {
    this.renderer.xr.enabled = true;

    if ("xr" in navigator) {
      navigator.xr.isSessionSupported("immersive-ar").then((supported) => {
        if (supported) {
          const collection = document.getElementsByClassName("ar-button");
          [...collection].forEach((el) => {
            el.style.display = "block";
          });
        }
      });
    }

    const self = this;

    this.hitTestSourceRequested = false;
    this.hitTestSource = null;

    function onSelect() {
      if (self.chair === undefined) return;

      if (self.reticle.visible) {
        self.chair.position.setFromMatrixPosition(self.reticle.matrix);
        self.chair.visible = true;

        // Sound mapping for models
        const soundMap = {
          1: "esound.mp3", // Sound for ELE1.glb
          2: "b.mp3", // Sound for ELE2.glb
          3: "b.mp3", // Sound for ELE3.glb
          4: "b.mp3", // Sound for ELE4.glb
          // Add more sounds as needed
        };

        const audioFile = soundMap[self.currentModelId];

        if (audioFile) {
          console.log(
            `Playing sound for model ${self.currentModelId}: ${audioFile}`
          );

          if (!self.audio || self.audioFile !== audioFile) {
            // Clean up the previous audio instance
            if (self.audio) {
              self.audio.stop();
              self.camera.remove(self.audio.listener);
            }

            // Create a new audio listener and audio instance
            const listener = new THREE.AudioListener();
            self.camera.add(listener);

            self.audio = new THREE.Audio(listener);
            const audioLoader = new THREE.AudioLoader();

            audioLoader.load(
              `./assets/audio/${audioFile}`,
              function (buffer) {
                // Audio loaded successfully
                self.audio.setBuffer(buffer);
                self.audio.setLoop(true); // Set to true if you want looping audio
                self.audio.setVolume(1.0);
                self.audio.play();
              },
              undefined,
              function (error) {
                console.error(`Error loading audio file ${audioFile}:`, error);
              }
            );

            self.audioFile = audioFile; // Update the current audio file reference
          } else {
            // Resume playing the same audio if already loaded
            if (self.audio.isPlaying) {
              self.audio.stop();
            }
            self.audio.play();
          }
        } else {
          console.log(`No sound assigned for model ID: ${self.currentModelId}`);
        }
      }
    }

    this.controller = this.renderer.xr.getController(0);
    this.controller.addEventListener("select", onSelect);

    this.scene.add(this.controller);
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  setEnvironment() {
    const loader = new RGBELoader().setDataType(THREE.UnsignedByteType);
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    const self = this;

    loader.load(
      "../../assets/hdr/venice_sunset_1k.hdr",
      (texture) => {
        const envMap = pmremGenerator.fromEquirectangular(texture).texture;
        pmremGenerator.dispose();

        self.scene.environment = envMap;
      },
      undefined,
      (err) => {
        console.error("An error occurred setting the environment");
      }
    );
  }

  showChair(id) {
    this.initAR();

    const loader = new GLTFLoader().setPath(this.assetsPath);
    const self = this;

    this.loadingBar.visible = true;

    const scaleConfig = {
      1: { x: 5, y: 5, z: 5 },
      2: { x: 0.01, y: 0.01, z: 0.01 },
      3: { x: 0.06, y: 0.06, z: 0.06 },
      4: { x: 0.03, y: 0.03, z: 0.03 },
      5: { x: 0.3, y: 0.3, z: 0.3 },
    };

    loader.load(
      `ELE${id}.glb`,
      function (gltf) {
        self.scene.add(gltf.scene);
        self.chair = gltf.scene;

        const scale = scaleConfig[id] || { x: 1, y: 1, z: 1 };
        self.chair.scale.set(scale.x, scale.y, scale.z);

        self.chair.visible = false;

        self.currentModelId = id;

        if (gltf.animations && gltf.animations.length > 0) {
          self.mixer = new THREE.AnimationMixer(gltf.scene);
          gltf.animations.forEach((clip) => {
            self.mixer.clipAction(clip).play();
          });
        }

        self.loadingBar.visible = false;

        self.renderer.setAnimationLoop(self.render.bind(self));
      },
      function (xhr) {
        self.loadingBar.progress = xhr.loaded / xhr.total;
      },
      function (error) {
        console.log("An error happened while loading the model:", error);
      }
    );

    this.arInterface.classList.remove("hidden");

    // Delay showing back button and description
    setTimeout(() => {
      const modelDescriptions = {
        1: "You are placing an Elephant model.",
        2: "You are placing a Chair model.",
        3: "You are placing a Table model.",
      };
      this.modelDescription.textContent =
        modelDescriptions[id] || "Placing your model...";
      this.backButton.style.display = "block";
      this.modelDescription.parentElement.style.display = "block";
    }, 500); // Delay of 500ms to ensure camera is ready
  }

  initAR() {
    let currentSession = null;
    const self = this;

    const sessionInit = { requiredFeatures: ["hit-test"] };

    function onSessionStarted(session) {
      session.addEventListener("end", onSessionEnded);

      self.renderer.xr.setReferenceSpaceType("local");
      self.renderer.xr.setSession(session);

      currentSession = session;
    }

    function onSessionEnded() {
      currentSession.removeEventListener("end", onSessionEnded);

      currentSession = null;

      if (self.chair !== null) {
        self.scene.remove(self.chair);
        self.chair = null;
      }

      self.renderer.setAnimationLoop(null);
    }

    if (currentSession === null) {
      navigator.xr
        .requestSession("immersive-ar", sessionInit)
        .then(onSessionStarted);
    } else {
      currentSession.end();
    }
  }

  requestHitTestSource() {
    const self = this;

    const session = this.renderer.xr.getSession();

    session.requestReferenceSpace("viewer").then(function (referenceSpace) {
      session
        .requestHitTestSource({ space: referenceSpace })
        .then(function (source) {
          self.hitTestSource = source;
        });
    });

    session.addEventListener("end", function () {
      self.hitTestSourceRequested = false;
      self.hitTestSource = null;
      self.referenceSpace = null;
    });

    this.hitTestSourceRequested = true;
  }

  getHitTestResults(frame) {
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

  onTouchStart(event) {
    this.controls.enabled = true;
  }

  onTouchEnd(event) {
    this.controls.enabled = false;
  }

  render(timestamp, frame) {
    if (frame) {
      if (this.hitTestSourceRequested === false) this.requestHitTestSource();

      if (this.hitTestSource) this.getHitTestResults(frame);
    }

    // Update animations
    if (this.mixer) {
      this.mixer.update(this.clock.getDelta());
    }

    this.renderer.render(this.scene, this.camera);
    this.controls.update();
  }
  exitAR() {
    if (this.renderer.xr.getSession()) {
      this.renderer.xr.getSession().end();
    }

    this.arInterface.classList.add("hidden");

    this.backButton.style.display = "none";
    this.modelDescription.parentElement.style.display = "none";

    if (this.chair) {
      this.scene.remove(this.chair);
      this.chair = null;
    }

    this.renderer.setAnimationLoop(null);
  }
}

export { App };
