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
    this.audioPath = "../../assets/audio/";

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

    this.models = {}; // To store model and sound data
    this.setupXR();

    window.addEventListener("resize", this.resize.bind(this));

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
      if (!self.reticle.visible || !self.selectedModel) return;

      const { model, sound } = self.models[self.selectedModel];
      model.position.setFromMatrixPosition(self.reticle.matrix);
      model.visible = true;

      // Play the corresponding sound
      if (sound.isPlaying) {
        sound.stop();
      }
      sound.play();
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

    loader.load(
      "../../assets/hdr/venice_sunset_1k.hdr",
      (texture) => {
        const envMap = pmremGenerator.fromEquirectangular(texture).texture;
        pmremGenerator.dispose();
        this.scene.environment = envMap;
      },
      undefined,
      (err) => {
        console.error("An error occurred setting the environment");
      }
    );
  }

  loadModel(id) {
    const loader = new GLTFLoader().setPath(this.assetsPath);
    const self = this;

    this.loadingBar.visible = true;

    loader.load(
      `ELE${id}.glb`,
      (gltf) => {
        const model = gltf.scene;
        self.scene.add(model);

        model.scale.set(5, 5, 5);
        model.visible = false;

        // Set up animation
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(model);
          gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
          self.models[`ELE${id}`] = { model, mixer, sound: null };
        } else {
          self.models[`ELE${id}`] = { model, mixer: null, sound: null };
        }

        self.loadingBar.visible = false;

        // Start animation loop
        self.renderer.setAnimationLoop(self.render.bind(self));
      },
      (xhr) => {
        self.loadingBar.progress = xhr.loaded / xhr.total;
      },
      (error) => {
        console.log("An error happened while loading the model:", error);
      }
    );
  }

  loadSound(id) {
    const audioLoader = new THREE.AudioLoader();
    const listener = new THREE.AudioListener();
    this.camera.add(listener);

    const sound = new THREE.Audio(listener);
    const self = this;

    audioLoader.load(`${this.audioPath}sound${id}.wav`, (buffer) => {
      sound.setBuffer(buffer);
      sound.setLoop(false);
      sound.setVolume(0.5);
      self.models[`ELE${id}`].sound = sound;
    });
  }

  loadAssets() {
    for (let i = 1; i <= 3; i++) {
      this.loadModel(i);
      this.loadSound(i);
    }
  }

  render(timestamp, frame) {
    if (frame) {
      if (this.hitTestSourceRequested === false) this.requestHitTestSource();
      if (this.hitTestSource) this.getHitTestResults(frame);
    }

    Object.values(this.models).forEach(({ mixer }) => {
      if (mixer) mixer.update(this.clock.getDelta());
    });

    this.renderer.render(this.scene, this.camera);
    this.controls.update();
  }
}

export { App };
