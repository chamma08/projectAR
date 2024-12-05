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

    // Touch event listeners
    this.renderer.domElement.addEventListener(
      "touchstart",
      this.onTouchStart.bind(this),
      false
    );
    this.renderer.domElement.addEventListener(
      "touchend",
      this.onTouchEnd.bind(this),
      false
    );
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

    loader.load(
      `en${id}.glb`,
      function (gltf) {
        self.scene.add(gltf.scene);
        self.chair = gltf.scene;

        self.chair.visible = false;

        // Set up animation
        if (gltf.animations && gltf.animations.length > 0) {
          self.mixer = new THREE.AnimationMixer(gltf.scene);
          gltf.animations.forEach((clip) => {
            self.mixer.clipAction(clip).play();
          });
        }

        self.loadingBar.visible = false;

        // Start animation loop
        self.renderer.setAnimationLoop(self.render.bind(self));
      },
      function (xhr) {
        self.loadingBar.progress = xhr.loaded / xhr.total;
      },
      function (error) {
        console.log("An error happened while loading the model:", error);
      }
    );
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
}

export { App };
