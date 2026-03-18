
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Environment configuration
const ENV = {
    DEV_MODE: true // Set to true to enable detailed physics and logic logging
};

export class DiceRoller {
    constructor(container, onResult) {
        this.container = container;
        this.onResult = onResult;
        this.width = container.clientWidth;
        this.height = container.clientHeight;
        
        this.scene = new THREE.Scene();
        this.world = new CANNON.World();
        this.world.allowSleep = true;
        this.world.gravity.set(0, -9.82 * 5, 0); // Reduced from 10x to 5x back to prevent jitter
        this.world.broadphase = new CANNON.NaiveBroadphase();
        this.world.solver.iterations = 10;
        
        // Physics Materials
        // Friction 0.01, Restitution 0.5 (as per threejs-dice repo defaults)
        // But the user requested "use the phyic from here".
        // The repo actually uses default contact material or specific settings.
        // Let's use the settings that make it roll nicely.
        // The repo example uses default, but often people tweak it.
        // Actually, the repo source code sets friction 0.01 usually for sliding?
        // No, standard dice need some friction to tumble.
        // Let's stick to 0.3 friction which works well, or try 0.1 if it's too sticky.
        this.diceMaterial = new CANNON.Material();
        this.floorMaterial = new CANNON.Material();
        const contactMaterial = new CANNON.ContactMaterial(
            this.floorMaterial, this.diceMaterial,
            { friction: 0.3, restitution: 0.5 } // Increased friction to stop endless sliding
        );
        this.world.addContactMaterial(contactMaterial);

        this.dice = [];
        this.bodies = [];
        this.isRolling = false;
        this.restFrameCount = 0;
        
        this.initCamera();
        this.initLights();
        this.initRenderer();
        this.initFloor();
        
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
        
        window.addEventListener('resize', () => this.onResize());
    }

    initCamera() {
        this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 100);
        this.camera.position.set(0, 15, 10);
        this.camera.lookAt(0, 0, 0);
    }

    initLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 20, 10);
        dirLight.castShadow = true;
        this.scene.add(dirLight);
        this.scene.add(dirLight.target); // Target needs to be in scene to update automatically
    }

    initRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.width, this.height);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);
    }

    initFloor() {
        // Visual Floor with Grid Texture
        const geometry = new THREE.PlaneGeometry(200, 200);
        
        // Create a simple grid texture programmatically
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        // Background
        ctx.fillStyle = '#1a1a1a'; // Dark surface
        ctx.fillRect(0, 0, 512, 512);
        
        // Grid lines
        ctx.strokeStyle = '#2a2a2a'; // Lighter lines
        ctx.lineWidth = 2;
        
        // Draw grid
        const step = 64;
        for (let i = 0; i <= 512; i += step) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, 512);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(512, i);
            ctx.stroke();
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(20, 20); // Repeat many times
        
        const material = new THREE.MeshStandardMaterial({ 
            map: texture,
            roughness: 0.8,
            metalness: 0.2
        });
        
        this.floorMesh = new THREE.Mesh(geometry, material);
        this.floorMesh.rotation.x = -Math.PI / 2;
        this.floorMesh.receiveShadow = true;
        this.scene.add(this.floorMesh);

        // Physics Floor
        const floorShape = new CANNON.Plane();
        this.floorBody = new CANNON.Body({ mass: 0, material: this.floorMaterial });
        this.floorBody.addShape(floorShape);
        this.floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.world.addBody(this.floorBody);
    }

    createDice(type) {
        this.clearDice();
        this.isRolling = true; // Treat creation as a roll so it settles and snaps
        this.currentDiceType = type;

        // Reset camera when a new dice is created
        if (!this.cameraTarget) this.cameraTarget = new THREE.Vector3(0, 0, 0);
        
        this.isSnapping = false;
        this.snapProgress = 0;
        
        // Reset light position
        const dirLight = this.scene.children.find(c => c.type === 'DirectionalLight');
        if (dirLight) {
            dirLight.position.set(this.cameraTarget.x + 10, 20, this.cameraTarget.z + 10);
            dirLight.target.position.copy(this.cameraTarget);
        }

        let geometry;
        const scale = 2.0;

        switch (type) {
            case 'd4': geometry = new THREE.TetrahedronGeometry(scale); break;
            case 'd6': geometry = new THREE.BoxGeometry(scale, scale, scale); break;
            case 'd8': geometry = new THREE.OctahedronGeometry(scale); break;
            case 'd10': geometry = new THREE.IcosahedronGeometry(scale); break; // Mapping 0-9 twice
            case 'd12': geometry = new THREE.DodecahedronGeometry(scale); break;
            case 'd20': geometry = new THREE.IcosahedronGeometry(scale); break;
            default: geometry = new THREE.BoxGeometry(scale, scale, scale);
        }

        // Material
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x00d4aa, // Primary color (greenish) from prompt
            emissive: 0x000000,
            roughness: 0.1,
            metalness: 0.1,
            flatShading: true
        });

        // Mesh
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.dice.push(mesh);
        
        // Add labels
        this.addFaceLabels(mesh, type);

        // Physics Body
        // Use simpler shapes for collision where possible, but ConvexPolyhedron is most accurate for these
        let shape;
        if (type === 'd6') {
            // Adjust box shape to match the new scale = 2.0
            shape = new CANNON.Box(new CANNON.Vec3(scale/2, scale/2, scale/2));
        } else {
            // ConvexPolyhedron for others to match visual geometry
            shape = this.createConvexPolyhedron(geometry);
        }

        const body = new CANNON.Body({ mass: 1, material: this.diceMaterial });
        body.addShape(shape);
        body.linearDamping = 0.5;
        body.angularDamping = 0.5;
        body.allowSleep = true;
        body.sleepSpeedLimit = 0.5;
        body.sleepTimeLimit = 0.5;
        
        // Random start position for "real calculation" feel
        // Use the same throw logic as roll() so initial drop looks like a throw
        /*
        const angle = Math.random() * Math.PI * 2;
        const radius = 15 + Math.random() * 5;
        body.position.set(
            Math.cos(angle) * radius,
            5 + Math.random() * 5,
            Math.sin(angle) * radius
        );
        
        // Initial velocity (aim at center)
        const targetX = (Math.random() - 0.5) * 5;
        const targetZ = (Math.random() - 0.5) * 5;
        const dirX = targetX - body.position.x;
        const dirZ = targetZ - body.position.z;
        const len = Math.sqrt(dirX*dirX + dirZ*dirZ);
        const speed = 25 + Math.random() * 15; // Match new roll speed
        
        body.velocity.set(
            (dirX / len) * speed,
            10 + Math.random() * 10,
            (dirZ / len) * speed
        );
        
        body.angularDamping = 0.3;
        body.linearDamping = 0.3;
        
        // Random initial rotation
        body.quaternion.setFromEuler(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
        
        // Add random spin
        const spinForce = 30;
        body.angularVelocity.set(
            (Math.random() - 0.5) * spinForce,
            (Math.random() - 0.5) * spinForce,
            (Math.random() - 0.5) * spinForce
        );
        */
        
        // Just place it far away initially to prevent flash before roll() moves it
        // But roll() sets position immediately.
        // The issue might be that createDice sets position, then roll() overwrites it.
        // And roll() logic uses camera position.
        
        // Remove the manual positioning in createDice since roll() handles it better
        // body.position.set(0, -100, 0);

        this.world.addBody(body);
        this.bodies.push(body);
        
        // Ensure mesh syncs immediately so camera doesn't jump
        if (this.dice.length > 0) {
            this.dice[0].position.copy(body.position);
            this.dice[0].quaternion.copy(body.quaternion);
        }
        
        // Reset camera target immediately
        if (!this.cameraTarget) this.cameraTarget = new THREE.Vector3(0, 0, 0);
        
        this.isSnapping = false;
        this.snapProgress = 0;
        
        // Trigger initial roll
        this.isRolling = false;
        this.roll();
    }

    addFaceLabels(mesh, type) {
        const geometry = mesh.geometry;
        const pos = geometry.attributes.position;
        const count = geometry.index ? geometry.index.count : pos.count;
        const getIndex = (i) => geometry.index ? geometry.index.getX(i) : i;

        // Group faces by their result value to average centers
        const faceGroups = {};

        for (let i = 0; i < count; i += 3) {
            const a = getIndex(i);
            const b = getIndex(i+1);
            const c = getIndex(i+2);

            const vA = new THREE.Vector3().fromBufferAttribute(pos, a);
            const vB = new THREE.Vector3().fromBufferAttribute(pos, b);
            const vC = new THREE.Vector3().fromBufferAttribute(pos, c);

            const center = new THREE.Vector3().addVectors(vA, vB).add(vC).divideScalar(3);
            const normal = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(vB, vA), new THREE.Vector3().subVectors(vC, vA)).normalize();

            // Calculate which number this face represents using the same logic as detectFace
            const faceIndex = i / 3;
            let result = 0;

            if (type === 'd4') {
                result = (faceIndex % 4) + 1;
            } else if (type === 'd6') {
                result = Math.floor(faceIndex / 2) + 1;
            } else if (type === 'd8') {
                result = (faceIndex % 8) + 1;
            } else if (type === 'd10') {
                const val = (faceIndex % 20) + 1;
                result = val > 10 ? val - 10 : val;
                if (result === 10) result = 0;
            } else if (type === 'd12') {
                result = Math.floor(faceIndex / 3) + 1;
            } else if (type === 'd20') {
                result = (faceIndex % 20) + 1;
            }

            // Create unique key for face group (approximate center for non-flat faces? No, result is better)
            // But d10 maps two faces to same number. We want 2 labels for d10.
            // So we key by faceIndex or group them if they are adjacent coplanar?
            // For d6 (Box), 2 triangles per face. We want 1 label.
            // For d12 (Dodecahedron), 3 triangles per face. We want 1 label.
            // For others, 1 triangle per face.
            
            // We can group by "result" AND "normal direction" roughly?
            // Or just group by result for d6/d12.
            // For d10, result 1 appears twice on opposite sides? No, Icosahedron mapping 0-19.
            // Face 0 and Face 10 might be far apart.
            // So for d10, we should NOT group by result alone.
            // Let's use a composite key for grouping: result + rough normal.
            
            // Simplify: Just iterate logic based on dice type.
            
            let groupKey = result;
            if (type === 'd10') {
                // d10 has 2 sets of 1-10.
                // We need to distinguish them.
                // The first 10 faces (0-9) are one set? No, indices are 0-19.
                // (faceIndex % 20) + 1. 
                // Face 0 -> 1. Face 10 -> 11 -> 1.
                // These are distinct faces.
                groupKey = faceIndex; // Treat every face as unique for d10?
                // Wait, d10 (Icosahedron) has 20 faces. We want 20 labels (0-9 twice).
                // So treating each faceIndex as unique is fine.
            } else if (type === 'd6' || type === 'd12') {
                 // Group by result
                 groupKey = result;
            } else {
                 // d4, d8, d20: 1 triangle per face.
                 groupKey = faceIndex;
            }

            if (!faceGroups[groupKey]) {
                faceGroups[groupKey] = { centers: [], normals: [], result: result };
            }
            faceGroups[groupKey].centers.push(center);
            faceGroups[groupKey].normals.push(normal);
        }

        // Generate Labels
        for (const key in faceGroups) {
            const group = faceGroups[key];
            
            // Average center
            const center = new THREE.Vector3();
            group.centers.forEach(c => center.add(c));
            center.divideScalar(group.centers.length);

            // Average normal
            const normal = new THREE.Vector3();
            group.normals.forEach(n => normal.add(n));
            normal.normalize();

            // Offset slightly
            // The dice scale is 2.0 (set in createDice)
            // But we didn't store the scale property on the mesh or use it here.
            // The position buffer is already scaled by geometry constructor?
            // Yes, TetrahedronGeometry(2.0).
            
            // However, the labels might be inside the mesh if offset is too small.
            // Let's push them out more aggressively.
            const offset = 0.05; 
            const position = center.clone().add(normal.clone().multiplyScalar(offset));

            // Create Label
            const texture = this.createLabelTexture(String(group.result));
            
            // Use a Plane Mesh instead if we want it to rotate with the die.
            
            const planeGeo = new THREE.PlaneGeometry(1, 1);
            const planeMat = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity: 1,
                side: THREE.DoubleSide,
                depthTest: true, 
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -1, // Pull forward
                polygonOffsetUnits: -4
            });
            const plane = new THREE.Mesh(planeGeo, planeMat);
            
            plane.position.copy(position);
            plane.lookAt(position.clone().add(normal)); // Look at normal
            
            // Adjust scale
            // Dice scale is 2.0. Face size depends on dice type.
            // d20 faces are small. d6 faces are large.
            // Let's adjust scale based on type.
            let labelScale = 0.8;
            if (type === 'd20' || type === 'd12' || type === 'd10') labelScale = 0.5;
            if (type === 'd4') labelScale = 1.0;
            
            plane.scale.set(labelScale, labelScale, 1);
            
            mesh.add(plane);
        }
    }

    createLabelTexture(text) {
        const canvas = document.createElement('canvas');
        const size = 128; // Texture size
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Debug background
        // ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
        // ctx.fillRect(0, 0, size, size);

        ctx.fillStyle = '#ffffff'; // Text color
        ctx.font = 'bold 80px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Shadow/Glow (removed for cleaner look on green dice)
        // ctx.shadowColor = '#00d4aa';
        // ctx.shadowBlur = 10;
        
        ctx.fillText(text, size / 2, size / 2);

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    createConvexPolyhedron(geometry) {
        const pos = geometry.attributes.position;
        const vertices = [];
        const faces = [];
        
        // Merge duplicate vertices to prevent Cannon.js collision seams
        const vertexMap = new Map();
        let uniqueCount = 0;
        
        const getUniqueIndex = (x, y, z) => {
            // Round to avoid precision issues
            const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
            if (vertexMap.has(key)) return vertexMap.get(key);
            vertexMap.set(key, uniqueCount);
            vertices.push(new CANNON.Vec3(x, y, z));
            return uniqueCount++;
        };

        const getIndex = (i) => geometry.index ? geometry.index.getX(i) : i;
        const count = geometry.index ? geometry.index.count : pos.count;

        for (let i = 0; i < count; i += 3) {
            const v1 = getUniqueIndex(pos.getX(getIndex(i)), pos.getY(getIndex(i)), pos.getZ(getIndex(i)));
            const v2 = getUniqueIndex(pos.getX(getIndex(i+1)), pos.getY(getIndex(i+1)), pos.getZ(getIndex(i+1)));
            const v3 = getUniqueIndex(pos.getX(getIndex(i+2)), pos.getY(getIndex(i+2)), pos.getZ(getIndex(i+2)));
            
            // Only add true triangles
            if (v1 !== v2 && v2 !== v3 && v1 !== v3) {
                faces.push([v1, v2, v3]);
            }
        }

        // Compute normals explicitly to ensure Cannon handles them correctly
        const poly = new CANNON.ConvexPolyhedron({ vertices, faces });
        poly.computeNormals();
        return poly;
    }

    clearDice() {
        this.dice.forEach(m => {
            this.scene.remove(m);
            m.geometry.dispose();
            m.material.dispose();
        });
        this.bodies.forEach(b => this.world.removeBody(b));
        this.dice = [];
        this.bodies = [];
    }

    roll() {
        // Allow re-rolling even if currently rolling to interrupt and restart
        // if (this.isRolling || this.bodies.length === 0) return;
        if (this.bodies.length === 0) return;
        
        this.isRolling = true;
        this.restFrameCount = 0;
        this.rollStartTime = performance.now();
        
        const body = this.bodies[0];
        body.type = CANNON.Body.DYNAMIC;
        body.wakeUp();

        // Initial rotation
        // Don't set initial rotation on body immediately if we want to match visual?
        // Actually, we want to start with a random rotation.
        // But for visual consistency, we should match.
        // Let's set a random rotation on the body, and the animate loop will sync mesh to body.
        
        const x = Math.random() * 2 * Math.PI;
        const y = Math.random() * 2 * Math.PI;
        const z = Math.random() * 2 * Math.PI;
        body.quaternion.setFromEuler(x, y, z);
        
        // --- Throw from Edge Calculation ---
        // Spawn on a circle edge and throw towards center
        
        const angle = Math.random() * Math.PI * 2;
        const radius = 15; // Start distance from center
        
        // Set initial position
        body.position.set(
            Math.cos(angle) * radius,
            5 + Math.random() * 5, // Start height
            Math.sin(angle) * radius
        );
        
        // Calculate velocity vector towards center (0,0,0)
        const targetX = 0;
        const targetZ = 0;
        
        // Vector from body to center
        const dx = targetX - body.position.x;
        const dz = targetZ - body.position.z;
        
        // Normalize direction
        const len = Math.sqrt(dx*dx + dz*dz);
        const ndx = dx/len;
        const ndz = dz/len;
        
        // Throw speed (randomized)
        const speed = 20 + Math.random() * 5;
        
        // Set velocity directly (instead of impulse, for cleaner control)
        body.velocity.set(
            ndx * speed,
            5 + Math.random() * 5, // Upward arc
            ndz * speed
        );
        
        // Add some torque
        body.angularVelocity.set(
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20
        );
        
        // Force sync mesh to body IMMEDIATELY to prevent 1-frame glitch at 0,0,0
        if (this.dice.length > 0) {
            this.dice[0].position.copy(body.position);
            this.dice[0].quaternion.copy(body.quaternion);
        }
        
        // Reset camera target immediately
        if (!this.cameraTarget) this.cameraTarget = new THREE.Vector3(0, 0, 0);
        
        this.isSnapping = false;
        this.snapProgress = 0;
        
        // this.roll(); // We are IN roll() now.
        
        if (ENV.DEV_MODE) {
            console.log(`[Logic] Roll triggered for ${this.currentDiceType}`);
        }
    }

    animate() {
        requestAnimationFrame(this.animate);
        
        this.world.step(1/60);
        
        for (let i = 0; i < this.dice.length; i++) {
            if (!this.isSnapping) {
                this.dice[i].position.copy(this.bodies[i].position);
                this.dice[i].quaternion.copy(this.bodies[i].quaternion);
            }
        }
        
        if (this.isRolling) {
            this.checkRest();
        }
        
        // Camera follow logic - Only follow if out of screen bounds
        if (this.dice.length > 0) {
            const targetPos = this.dice[0].position;
            
            // Check if dice is far from center (camera usually looks at center)
            // Screen center is approx 0,0. Let's say "out of screen" is when it moves > 8 units away
            // Or we can be smarter: project position to screen space.
            
            // Simpler: Keep camera looking near the dice, but only move if dice gets too far from camera target
            
            if (!this.cameraTarget) {
                this.cameraTarget = new THREE.Vector3(0, 0, 0);
            }
            
            // Desired target is the dice position (grounded)
            const desiredTarget = new THREE.Vector3(targetPos.x, 0, targetPos.z);
            
            // Use a smooth spring-like motion for the target
            // If dice is far, we pull camera towards it.
            // Deadzone logic:
            
            const dist = this.cameraTarget.distanceTo(desiredTarget);
            const deadzone = 5.0; 
            
            if (dist > deadzone) {
                // Calculate point on the edge of deadzone towards target
                // Actually, just simple lerp is fine if we make it very smooth.
                // Reducing lerp factor makes it "lag" more, feeling heavier/smoother.
                this.cameraTarget.lerp(desiredTarget, 0.02);
            } else if (dist > 0.1) {
                 // Even inside deadzone, drift VERY slowly to center it eventually?
                 // Or just stay still. Staying still is better for stability.
                 // Let's add a very slow drift if it's "safe" to do so, or just clamp.
                 // Actually, "only follow if out of screen" was the request.
                 // So we do NOTHING if dist < deadzone.
            }
            
            // Always look at the target
            const offset = new THREE.Vector3(0, 15, 10);
            
            // Smoothly interpolate the camera's actual position too, not just the target
            const desiredCamPos = this.cameraTarget.clone().add(offset);
            this.camera.position.lerp(desiredCamPos, 0.05);
            this.camera.lookAt(this.cameraTarget);
            
            // Update light to follow camera focus
            const dirLight = this.scene.children.find(c => c.type === 'DirectionalLight');
            if (dirLight) {
                dirLight.position.set(this.cameraTarget.x + 10, 20, this.cameraTarget.z + 10);
                dirLight.target.position.copy(this.cameraTarget);
            }
        }

        if (this.isSnapping && this.dice.length > 0) {
            this.snapProgress += 0.05; // Adjust speed here
            if (this.snapProgress > 1) this.snapProgress = 1;

            const t = this.snapProgress;
            // Ease out cubic
            const ease = 1 - Math.pow(1 - t, 3);
            
            this.dice[0].quaternion.slerpQuaternions(this.startQuaternion, this.targetQuaternion, ease);
            
            if (ENV.DEV_MODE && this.snapProgress < 1 && Math.random() < 0.1) {
                console.log(`[Animation] Snapping progress: ${(this.snapProgress*100).toFixed(1)}%`);
            }

            if (this.snapProgress >= 1) {
                if (ENV.DEV_MODE) console.log("[Logic] Snapping complete. Calling detectFace().");
                this.isSnapping = false;
                
                // Final hard snap to perfect position to avoid micro-misalignments
                this.dice[0].quaternion.copy(this.targetQuaternion);
                
                // Keep body synced with mesh
                // Ensure it doesn't clip into floor when snapped flat
                const offsetUp = 0.1; // small offset to prevent floor collision wakeup
                this.bodies[0].type = CANNON.Body.STATIC; // freeze physics!
                this.bodies[0].position.set(this.dice[0].position.x, this.dice[0].position.y + offsetUp, this.dice[0].position.z);
                this.bodies[0].quaternion.copy(this.targetQuaternion);
                this.bodies[0].velocity.set(0, 0, 0);
                this.bodies[0].angularVelocity.set(0, 0, 0);
                this.bodies[0].sleep(); // Ensure it stays put
                
                this.detectFace();
            }
        }
        
        this.renderer.render(this.scene, this.camera);
    }

    checkRest() {
        if (this.bodies.length === 0) return;
        const body = this.bodies[0];

        // Check for rest
        const threshold = 1.0; 
        
        const vLen = body.velocity.length();
        const aLen = body.angularVelocity.length();
        const timeRolling = performance.now() - this.rollStartTime;
        
        if (ENV.DEV_MODE && this.restFrameCount % 10 === 0 && (vLen > 0 || aLen > 0)) {
            console.log(`[Physics] vLen: ${vLen.toFixed(3)}, aLen: ${aLen.toFixed(3)}, time: ${timeRolling.toFixed(0)}ms`);
        }

        if ((vLen < threshold && aLen < threshold) || timeRolling > 2000) {
            this.restFrameCount++;
        } else {
            this.restFrameCount = 0;
        }
        
        // If resting for enough frames or forced time limit reached
        if (this.restFrameCount > 5 || timeRolling > 2500) {
            if (ENV.DEV_MODE) console.log("[Logic] Dice has come to rest. Triggering snapToNearestFace.");
            this.isRolling = false;
            
            // Force stop completely
            body.velocity.set(0, 0, 0);
            body.angularVelocity.set(0, 0, 0);
            body.sleep();
            
            this.snapToNearestFace();
        }
    }

    snapToNearestFace() {
        const mesh = this.dice[0];
        const geometry = mesh.geometry;
        const pos = geometry.attributes.position;
        const up = new THREE.Vector3(0, 1, 0);
        
        let maxDot = -Infinity;
        let bestNormal = new THREE.Vector3();
        
        // Helper to get face normal in world space
        const getFaceNormal = (a, b, c) => {
            const vA = new THREE.Vector3().fromBufferAttribute(pos, a);
            const vB = new THREE.Vector3().fromBufferAttribute(pos, b);
            const vC = new THREE.Vector3().fromBufferAttribute(pos, c);
            const ab = new THREE.Vector3().subVectors(vB, vA);
            const ac = new THREE.Vector3().subVectors(vC, vA);
            const normal = new THREE.Vector3().crossVectors(ab, ac).normalize();
            normal.applyQuaternion(mesh.quaternion);
            return normal;
        };

        const count = geometry.index ? geometry.index.count : pos.count;
        const getIndex = (i) => geometry.index ? geometry.index.getX(i) : i;

        for (let i = 0; i < count; i += 3) {
            const a = getIndex(i);
            const b = getIndex(i+1);
            const c = getIndex(i+2);
            
            const normal = getFaceNormal(a, b, c);
            let dot = normal.dot(up);

            if (this.currentDiceType === 'd4') {
                dot = -dot; // Find face pointing down
            }
            
            if (dot > maxDot) {
                maxDot = dot;
                bestNormal = normal;
            }
        }
        
        // Calculate rotation needed to align bestNormal to UP (or DOWN for d4)
        const targetDir = (this.currentDiceType === 'd4') ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(0, 1, 0);
        
        // We need a quaternion that rotates bestNormal to targetDir
        const qAdjust = new THREE.Quaternion().setFromUnitVectors(bestNormal, targetDir);
        
        this.startQuaternion = mesh.quaternion.clone();
        this.targetQuaternion = qAdjust.multiply(this.startQuaternion);
        
        this.isSnapping = true;
        this.snapProgress = 0;
    }

    detectFace() {
        const mesh = this.dice[0];
        const geometry = mesh.geometry;
        const pos = geometry.attributes.position;
        
        // World UP
        const up = new THREE.Vector3(0, 1, 0);
        
        let maxDot = -Infinity;
        let bestFaceIndex = -1;
        
        // Helper to get face normal in world space
        const getFaceNormal = (a, b, c) => {
            const vA = new THREE.Vector3().fromBufferAttribute(pos, a);
            const vB = new THREE.Vector3().fromBufferAttribute(pos, b);
            const vC = new THREE.Vector3().fromBufferAttribute(pos, c);
            
            const ab = new THREE.Vector3().subVectors(vB, vA);
            const ac = new THREE.Vector3().subVectors(vC, vA);
            const normal = new THREE.Vector3().crossVectors(ab, ac).normalize();
            
            normal.applyQuaternion(mesh.quaternion);
            return normal;
        };

        const count = geometry.index ? geometry.index.count : pos.count;
        const getIndex = (i) => geometry.index ? geometry.index.getX(i) : i;

        for (let i = 0; i < count; i += 3) {
            const a = getIndex(i);
            const b = getIndex(i+1);
            const c = getIndex(i+2);
            
            const normal = getFaceNormal(a, b, c);
            let dot = normal.dot(up);

            // Special case for d4: we want the face pointing DOWN (-1)
            if (this.currentDiceType === 'd4') {
                dot = -dot; // Invert so that -1 becomes 1 (max)
            }
            
            if (dot > maxDot) {
                maxDot = dot;
                bestFaceIndex = i / 3;
            }
        }

        // Map bestFaceIndex to result
        let result = 0;
        
        // Map based on dice type
        if (this.currentDiceType === 'd4') {
            result = (bestFaceIndex % 4) + 1;
        } else if (this.currentDiceType === 'd6') {
            result = Math.floor(bestFaceIndex / 2) + 1;
        } else if (this.currentDiceType === 'd8') {
             result = (bestFaceIndex % 8) + 1;
        } else if (this.currentDiceType === 'd10') {
             const val = (bestFaceIndex % 20) + 1;
             result = val > 10 ? val - 10 : val;
             if (result === 10) result = 0;
        } else if (this.currentDiceType === 'd12') {
             result = Math.floor(bestFaceIndex / 3) + 1;
        } else if (this.currentDiceType === 'd20') {
             result = (bestFaceIndex % 20) + 1;
        }

        if (ENV.DEV_MODE) {
            console.log(`[Result] Type: ${this.currentDiceType}, Index: ${bestFaceIndex}, Final Value: ${result}`);
            console.log(`[Result] Max Dot Product: ${maxDot.toFixed(3)}`);
        }

        if (this.onResult) {
            this.onResult(result);
        }
    }

    onResize() {
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
    }
}
