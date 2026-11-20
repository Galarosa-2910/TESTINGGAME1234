"use strict";

const screens = document.querySelectorAll(".screen");
const navigationButtons = document.querySelectorAll("[data-screen]");
const highScoreValue = document.querySelector("#high-score-value");
const canvas = document.querySelector("#game-canvas");
const context = canvas.getContext("2d");

const keys = new Set();
const world = {
    width: 3200,
    height: 2200
};
const player = {
    x: world.width / 2,
    y: world.height / 2,
    width: 18,
    height: 24,
    speed: 220,
    maxHealth: 100,
    health: 100,
    damageCooldown: 0,
    level: 1,
    experience: 0,
    experienceToNextLevel: 40,
    pickupRange: 90,
    isMoving: false
};
const camera = {
    x: 0,
    y: 0
};
const enemies = [];
const projectiles = [];
const experienceOrbs = [];
const impactEffects = [];
const enemyTypes = {
    zombie: { health: 30, speed: 54, damage: 8, score: 10, experience: 15, radius: 13 },
    hound: { health: 22, speed: 100, damage: 12, score: 25, experience: 20, radius: 11 },
    mutant: { health: 90, speed: 34, damage: 18, score: 50, experience: 40, radius: 19 },
    tyrant: { health: 350, speed: 25, damage: 25, score: 500, experience: 100, radius: 30 }
};
const handgun = {
    damage: 20,
    cooldown: 0.55,
    range: 560,
    projectileSpeed: 520,
    projectileCount: 1
};
const upgrades = [
    {
        name: "Reinforced Rounds",
        description: "Increase handgun damage by 8.",
        apply: () => { handgun.damage += 8; }
    },
    {
        name: "Quick Trigger",
        description: "Fire the handgun 15% faster.",
        apply: () => { handgun.cooldown = Math.max(0.18, handgun.cooldown * 0.85); }
    },
    {
        name: "Field Medic",
        description: "Recover 25 health immediately.",
        apply: () => { player.health = Math.min(player.maxHealth, player.health + 25); }
    },
    {
        name: "Combat Training",
        description: "Increase movement speed by 25.",
        apply: () => { player.speed += 25; }
    },
    {
        name: "Expanded Magazine",
        description: "Fire one additional handgun projectile.",
        apply: () => { handgun.projectileCount += 1; }
    },
    {
        name: "Scavenger",
        description: "Increase experience pickup range by 35.",
        apply: () => { player.pickupRange += 35; }
    }
];

let animationFrameId = null;
let previousTime = 0;
let gameIsRunning = false;
let enemySpawnTimer = 0;
let nextEnemyId = 1;
let handgunCooldown = 0;
let levelUpPending = false;
let survivalTime = 0;
let score = 0;
let kills = 0;
let bossesDefeated = 0;
let lastScoredMinute = 0;
let nextBossTime = 60;
let visualTime = 0;

const allowedMovementKeys = new Set([
    "w",
    "a",
    "s",
    "d",
    "arrowup",
    "arrowleft",
    "arrowdown",
    "arrowright"
]);

function showScreen(screenId) {
    screens.forEach((screen) => {
        const isSelected = screen.id === screenId;
        screen.hidden = !isSelected;
        screen.classList.toggle("screen--active", isSelected);
    });

    if (screenId === "high-scores") {
        displayHighScore();
    }

    if (screenId === "gameplay") {
        startGame();
    } else {
        stopGame();
    }
}

function displayHighScore() {
    highScoreValue.textContent = formatScore(getSavedHighScore());
}

function getSavedHighScore() {
    try {
        return Number.parseInt(localStorage.getItem("biohazardHighScore") || "0", 10);
    } catch (error) {
        console.warn("High scores are unavailable in this browser context.", error);
        return 0;
    }
}

function saveHighScore() {
    const personalBest = Math.max(score, getSavedHighScore());

    try {
        localStorage.setItem("biohazardHighScore", String(personalBest));
    } catch (error) {
        console.warn("High score could not be saved in this browser context.", error);
    }

    return personalBest;
}

function formatScore(value) {
    return String(value).padStart(6, "0");
}

function startGame() {
    player.x = world.width / 2;
    player.y = world.height / 2;
    player.health = player.maxHealth;
    player.damageCooldown = 0;
    player.level = 1;
    player.experience = 0;
    player.experienceToNextLevel = 40;
    player.pickupRange = 90;
    player.speed = 220;
    handgun.damage = 20;
    handgun.cooldown = 0.55;
    handgun.projectileCount = 1;
    enemies.length = 0;
    projectiles.length = 0;
    experienceOrbs.length = 0;
    impactEffects.length = 0;
    enemySpawnTimer = 0;
    nextEnemyId = 1;
    handgunCooldown = 0;
    levelUpPending = false;
    survivalTime = 0;
    score = 0;
    kills = 0;
    bossesDefeated = 0;
    lastScoredMinute = 0;
    nextBossTime = 60;
    visualTime = 0;
    closeLevelUpOverlay();
    updateCamera();
    updateHealthBar();
    updateExperienceBar();
    updateScoreboard();
    gameIsRunning = true;
    previousTime = 0;

    if (animationFrameId === null) {
        animationFrameId = requestAnimationFrame(gameLoop);
    }
}

function stopGame() {
    gameIsRunning = false;
    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

function gameLoop(currentTime) {
    if (!gameIsRunning) {
        animationFrameId = null;
        return;
    }

    const deltaTime = previousTime === 0 ? 0 : Math.min((currentTime - previousTime) / 1000, 0.1);
    previousTime = currentTime;
    visualTime += deltaTime;
    updatePlayer(deltaTime);
    updateSurvival(deltaTime);
    updateEnemies(deltaTime);
    if (!gameIsRunning) {
        animationFrameId = null;
        return;
    }
    updateCombat(deltaTime);
    updateExperience(deltaTime);
    drawGame();

    if (!gameIsRunning) {
        animationFrameId = null;
        return;
    }

    animationFrameId = requestAnimationFrame(gameLoop);
}

function updatePlayer(deltaTime) {
    let horizontalDirection = 0;
    let verticalDirection = 0;

    if (keys.has("a") || keys.has("arrowleft")) {
        horizontalDirection -= 1;
    }
    if (keys.has("d") || keys.has("arrowright")) {
        horizontalDirection += 1;
    }
    if (keys.has("w") || keys.has("arrowup")) {
        verticalDirection -= 1;
    }
    if (keys.has("s") || keys.has("arrowdown")) {
        verticalDirection += 1;
    }

    if (horizontalDirection !== 0 && verticalDirection !== 0) {
        const diagonalLength = Math.sqrt(2);
        horizontalDirection /= diagonalLength;
        verticalDirection /= diagonalLength;
    }

    player.isMoving = horizontalDirection !== 0 || verticalDirection !== 0;
    player.x += horizontalDirection * player.speed * deltaTime;
    player.y += verticalDirection * player.speed * deltaTime;

    const halfWidth = player.width / 2;
    const halfHeight = player.height / 2;
    player.x = Math.max(halfWidth, Math.min(world.width - halfWidth, player.x));
    player.y = Math.max(halfHeight, Math.min(world.height - halfHeight, player.y));
    updateCamera();
}

function updateCamera() {
    camera.x = Math.max(0, Math.min(world.width - canvas.width, player.x - canvas.width / 2));
    camera.y = Math.max(0, Math.min(world.height - canvas.height, player.y - canvas.height / 2));
}

function updateSurvival(deltaTime) {
    survivalTime += deltaTime;
    const completedMinutes = Math.floor(survivalTime / 60);

    if (completedMinutes > lastScoredMinute) {
        score += (completedMinutes - lastScoredMinute) * 100;
        lastScoredMinute = completedMinutes;
    }

    if (survivalTime >= nextBossTime) {
        spawnEnemy("tyrant");
        nextBossTime += 60;
    }

    updateScoreboard();
}

function updateEnemies(deltaTime) {
    enemySpawnTimer -= deltaTime;
    if (enemySpawnTimer <= 0) {
        spawnEnemy();
        enemySpawnTimer = Math.max(0.45, 1.8 - survivalTime * 0.01);
    }

    player.damageCooldown = Math.max(0, player.damageCooldown - deltaTime);

    enemies.forEach((enemy) => {
        const distanceX = player.x - enemy.x;
        const distanceY = player.y - enemy.y;
        const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

        if (distance > 0) {
            enemy.x += (distanceX / distance) * enemy.speed * deltaTime;
            enemy.y += (distanceY / distance) * enemy.speed * deltaTime;
        }

        if (distance < enemy.radius + player.width / 2 && player.damageCooldown === 0) {
            player.health = Math.max(0, player.health - enemy.damage);
            player.damageCooldown = 0.75;
            updateHealthBar();

            if (player.health === 0) {
                finishGame();
                return;
            }
        }
    });

    removeDefeatedEnemies();
}

function spawnEnemy(type = chooseEnemyType()) {
    const side = Math.floor(Math.random() * 4);
    const padding = 30;
    let x = player.x;
    let y = player.y;

    if (side === 0) {
        x = camera.x - padding;
        y = camera.y + Math.random() * canvas.height;
    } else if (side === 1) {
        x = camera.x + canvas.width + padding;
        y = camera.y + Math.random() * canvas.height;
    } else if (side === 2) {
        x = camera.x + Math.random() * canvas.width;
        y = camera.y - padding;
    } else {
        x = camera.x + Math.random() * canvas.width;
        y = camera.y + canvas.height + padding;
    }

    const enemyType = enemyTypes[type];
    const difficultyMultiplier = 1 + survivalTime / 120;
    enemies.push({
        id: nextEnemyId,
        type,
        x: Math.max(16, Math.min(world.width - 16, x)),
        y: Math.max(16, Math.min(world.height - 16, y)),
        radius: enemyType.radius,
        speed: enemyType.speed * Math.min(difficultyMultiplier, 1.8),
        health: Math.round(enemyType.health * difficultyMultiplier),
        maxHealth: Math.round(enemyType.health * difficultyMultiplier),
        damage: enemyType.damage,
        score: enemyType.score,
        experience: enemyType.experience
    });
    nextEnemyId += 1;
}

function chooseEnemyType() {
    const roll = Math.random();

    if (survivalTime >= 40 && roll < 0.15) {
        return "mutant";
    }
    if (survivalTime >= 20 && roll < 0.35) {
        return "hound";
    }
    return "zombie";
}

function removeDefeatedEnemies() {
    for (let index = enemies.length - 1; index >= 0; index -= 1) {
        if (enemies[index].health <= 0) {
            experienceOrbs.push({
                x: enemies[index].x,
                y: enemies[index].y,
                value: enemies[index].experience
            });
            score += enemies[index].score;
            kills += 1;
            if (enemies[index].type === "tyrant") {
                bossesDefeated += 1;
            }
            enemies.splice(index, 1);
            updateScoreboard();
        }
    }
}

function updateCombat(deltaTime) {
    handgunCooldown = Math.max(0, handgunCooldown - deltaTime);
    if (handgunCooldown === 0) {
        const target = findNearestEnemy();
        if (target !== null) {
            fireHandgun(target);
            handgunCooldown = handgun.cooldown;
        }
    }

    projectiles.forEach((projectile) => {
        projectile.x += projectile.velocityX * deltaTime;
        projectile.y += projectile.velocityY * deltaTime;
        projectile.life -= deltaTime;

        enemies.forEach((enemy) => {
            const distanceX = projectile.x - enemy.x;
            const distanceY = projectile.y - enemy.y;
            const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

            if (!projectile.hit && distance < projectile.radius + enemy.radius) {
                enemy.health -= projectile.damage;
                projectile.hit = true;
                impactEffects.push({ x: enemy.x, y: enemy.y, life: 0.16 });
            }
        });
    });

    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
        if (projectiles[index].life <= 0 || projectiles[index].hit) {
            projectiles.splice(index, 1);
        }
    }

    impactEffects.forEach((effect) => {
        effect.life -= deltaTime;
    });
    for (let index = impactEffects.length - 1; index >= 0; index -= 1) {
        if (impactEffects[index].life <= 0) {
            impactEffects.splice(index, 1);
        }
    }

    removeDefeatedEnemies();
}

function findNearestEnemy() {
    let nearestEnemy = null;
    let nearestDistance = handgun.range;

    enemies.forEach((enemy) => {
        const distanceX = player.x - enemy.x;
        const distanceY = player.y - enemy.y;
        const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

        if (distance < nearestDistance) {
            nearestEnemy = enemy;
            nearestDistance = distance;
        }
    });

    return nearestEnemy;
}

function fireHandgun(target) {
    const distanceX = target.x - player.x;
    const distanceY = target.y - player.y;
    const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

    for (let index = 0; index < handgun.projectileCount; index += 1) {
        const spread = (index - (handgun.projectileCount - 1) / 2) * 0.12;
        const angle = Math.atan2(distanceY, distanceX) + spread;
        projectiles.push({
            x: player.x,
            y: player.y,
            radius: 4,
            damage: handgun.damage,
            velocityX: Math.cos(angle) * handgun.projectileSpeed,
            velocityY: Math.sin(angle) * handgun.projectileSpeed,
            life: handgun.range / handgun.projectileSpeed,
            hit: false
        });
    }
}

function updateExperience() {
    for (let index = experienceOrbs.length - 1; index >= 0; index -= 1) {
        const orb = experienceOrbs[index];
        const distanceX = player.x - orb.x;
        const distanceY = player.y - orb.y;
        const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

        if (distance <= player.pickupRange) {
            player.experience += orb.value;
            experienceOrbs.splice(index, 1);
        }
    }

    if (player.experience >= player.experienceToNextLevel) {
        player.experience -= player.experienceToNextLevel;
        player.level += 1;
        player.experienceToNextLevel = Math.floor(player.experienceToNextLevel * 1.35);
        openLevelUpOverlay();
    }

    updateExperienceBar();
}

function updateExperienceBar() {
    const experienceBar = document.querySelector("#experience-bar");
    const levelValue = document.querySelector("#level-value");
    const experienceValue = document.querySelector("#experience-value");
    const experiencePercent = (player.experience / player.experienceToNextLevel) * 100;
    experienceBar.style.width = `${experiencePercent}%`;
    levelValue.textContent = String(player.level).padStart(2, "0");
    experienceValue.textContent = `${player.experience}/${player.experienceToNextLevel}`;
}

function openLevelUpOverlay() {
    if (levelUpPending) {
        return;
    }

    levelUpPending = true;
    gameIsRunning = false;
    renderUpgradeChoices();
    document.querySelector("#level-up-overlay").hidden = false;
}

function closeLevelUpOverlay() {
    levelUpPending = false;
    document.querySelector("#level-up-overlay").hidden = true;
}

function renderUpgradeChoices() {
    const upgradeOptions = document.querySelector("#upgrade-options");
    upgradeOptions.replaceChildren();

    getRandomUpgrades(3).forEach((upgrade) => {
        const option = document.createElement("button");
        option.className = "upgrade-option";
        option.innerHTML = `<strong>${upgrade.name}</strong><span>${upgrade.description}</span>`;
        option.addEventListener("click", () => {
            upgrade.apply();
            updateHealthBar();
            closeLevelUpOverlay();
            gameIsRunning = true;
            previousTime = 0;
            animationFrameId = requestAnimationFrame(gameLoop);
        });
        upgradeOptions.appendChild(option);
    });
}

function getRandomUpgrades(amount) {
    return [...upgrades].sort(() => Math.random() - 0.5).slice(0, amount);
}

function updateHealthBar() {
    const healthBar = document.querySelector("#health-bar");
    const healthValue = document.querySelector("#health-value");
    const healthPercent = (player.health / player.maxHealth) * 100;
    healthBar.style.width = `${healthPercent}%`;
    healthValue.textContent = `${player.health}/${player.maxHealth}`;
}

function finishGame() {
    gameIsRunning = false;
    const personalBest = saveHighScore();
    document.querySelector("#final-score").textContent = formatScore(score);
    document.querySelector("#final-time").textContent = formatSurvivalTime();
    document.querySelector("#final-kills").textContent = String(kills).padStart(3, "0");
    document.querySelector("#final-level").textContent = String(player.level).padStart(2, "0");
    document.querySelector("#final-bosses").textContent = String(bossesDefeated).padStart(2, "0");
    document.querySelector("#personal-best-value").textContent = formatScore(personalBest);
    showScreen("game-over");
}

function formatSurvivalTime() {
    const minutes = Math.floor(survivalTime / 60);
    const seconds = Math.floor(survivalTime % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateScoreboard() {
    document.querySelector("#survival-time").textContent = formatSurvivalTime();
    document.querySelector("#score-value").textContent = String(score).padStart(6, "0");
    document.querySelector("#kills-value").textContent = String(kills).padStart(3, "0");
    document.querySelector("#bosses-value").textContent = String(bossesDefeated).padStart(2, "0");
}

function drawGame() {
    context.save();
    context.translate(-camera.x, -camera.y);
    drawUrbanEnvironment();
    experienceOrbs.forEach(drawExperienceOrb);
    enemies.forEach(drawEnemy);
    projectiles.forEach(drawProjectile);
    impactEffects.forEach(drawImpactEffect);
    drawPlayer();
    context.restore();
}

function drawExperienceOrb(orb) {
    const pulse = Math.sin(visualTime * 8 + orb.x) * 1.5;
    context.fillStyle = "#7ec2a0";
    context.fillRect(orb.x - 4 - pulse / 2, orb.y - 4 - pulse / 2, 8 + pulse, 8 + pulse);
    context.fillStyle = "#c4e6ad";
    context.fillRect(orb.x - 2, orb.y - 2, 4, 4);
}

function drawImpactEffect(effect) {
    const radius = (1 - effect.life / 0.16) * 12;
    context.strokeStyle = `rgba(239, 92, 76, ${effect.life / 0.16})`;
    context.lineWidth = 2;
    context.strokeRect(effect.x - radius, effect.y - radius, radius * 2, radius * 2);
}

function drawUrbanEnvironment() {
    const { width, height } = world;

    context.fillStyle = "#111814";
    context.fillRect(0, 0, width, height);

    context.fillStyle = "#1b2520";
    context.fillRect(0, 0, width, 78);
    context.fillRect(0, height - 78, width, 78);
    context.fillRect(0, 0, 74, height);
    context.fillRect(width - 74, 0, 74, height);

    context.fillStyle = "#28322a";
    context.fillRect(74, 78, width - 148, height - 156);

    context.strokeStyle = "rgba(151, 164, 120, 0.15)";
    context.lineWidth = 2;
    for (let x = 100; x < width - 74; x += 48) {
        context.beginPath();
        context.moveTo(x, 78);
        context.lineTo(x, height - 78);
        context.stroke();
    }
    for (let y = 100; y < height - 78; y += 48) {
        context.beginPath();
        context.moveTo(74, y);
        context.lineTo(width - 74, y);
        context.stroke();
    }

    drawRoadMarkings();
    for (let x = 16; x < width; x += 280) {
        drawBuilding(x, 16, 42, 42);
        drawBuilding(x, height - 58, 42, 42);
    }
    for (let y = 16; y < height; y += 280) {
        drawBuilding(16, y, 42, 42);
        drawBuilding(width - 58, y, 42, 42);
    }
    for (let x = 108; x < width; x += 420) {
        drawStreetLight(x, 48);
        drawStreetLight(x, height - 76);
    }
    for (let y = 208; y < height - 150; y += 360) {
        drawDebris(230, y);
        drawDebris(width - 250, y + 120);
    }
}

function drawRoadMarkings() {
    context.fillStyle = "#687254";
    for (let x = 124; x < world.width - 124; x += 70) {
        context.fillRect(x, world.height / 2 - 2, 34, 4);
    }
    for (let y = 116; y < world.height - 116; y += 70) {
        context.fillRect(world.width / 2 - 2, y, 4, 34);
    }
}

function drawBuilding(x, y, width, height) {
    context.fillStyle = "#0a0e0c";
    context.fillRect(x, y, width, height);
    context.strokeStyle = "#53614b";
    context.strokeRect(x + 2, y + 2, width - 4, height - 4);
    context.fillStyle = "#9b563f";
    context.fillRect(x + 10, y + 12, 6, 6);
    context.fillRect(x + 26, y + 24, 6, 6);
}

function drawStreetLight(x, y) {
    context.fillStyle = "#69765b";
    context.fillRect(x - 2, y, 4, 28);
    context.fillRect(x - 8, y - 2, 16, 4);
    context.fillStyle = "rgba(214, 193, 108, 0.5)";
    context.fillRect(x - 4, y - 6, 8, 5);
}

function drawDebris(x, y) {
    context.fillStyle = "#72745a";
    context.fillRect(x, y, 14, 5);
    context.fillRect(x + 8, y - 5, 5, 10);
}

function drawPlayer() {
    const { x, y, width, height } = player;
    const bob = player.isMoving ? Math.sin(visualTime * 12) * 2 : 0;
    const flash = player.damageCooldown > 0.55;
    context.fillStyle = "rgba(0, 0, 0, 0.35)";
    context.fillRect(x - width / 2 - 3, y + height / 2 - 1, width + 6, 5);
    if (flash) {
        context.fillStyle = "rgba(239, 92, 76, 0.75)";
        context.fillRect(x - 13, y - 17 + bob, 26, 38);
    }
    context.fillStyle = "#c8c59d";
    context.fillRect(x - 6, y - 13 + bob, 12, 9);
    context.fillStyle = "#63745c";
    context.fillRect(x - 9, y - 4 + bob, 18, 19);
    context.fillStyle = "#9b3b32";
    context.fillRect(x - 9, y + 8 + bob, 18, 5);
    context.fillStyle = "#1b211a";
    context.fillRect(x - 8, y + 15 + bob, 6, 7);
    context.fillRect(x + 2, y + 15 + bob, 6, 7);
    context.fillStyle = "#c8c59d";
    context.fillRect(x + 8, y - 1 + bob, 8, 5);
}

function drawEnemy(enemy) {
    const { x, y } = enemy;
    context.fillStyle = "rgba(0, 0, 0, 0.35)";
    context.fillRect(x - enemy.radius, y + enemy.radius - 1, enemy.radius * 2, 5);

    if (enemy.type === "hound") {
        context.fillStyle = "#66745d";
        context.fillRect(x - 13, y - 7, 26, 12);
        context.fillStyle = "#a8a27a";
        context.fillRect(x + 10, y - 5, 5, 4);
        return;
    }

    if (enemy.type === "mutant" || enemy.type === "tyrant") {
        context.fillStyle = enemy.type === "tyrant" ? "#713b45" : "#596b56";
        context.fillRect(x - enemy.radius, y - enemy.radius, enemy.radius * 2, enemy.radius * 2);
        context.fillStyle = "#b64c3c";
        context.fillRect(x - 5, y - 5, 10, 7);
        context.fillStyle = "#202a20";
        context.fillRect(x - enemy.radius + 5, y + enemy.radius - 1, 8, 8);
        context.fillRect(x + enemy.radius - 13, y + enemy.radius - 1, 8, 8);
        return;
    }

    context.fillStyle = "#74816a";
    context.fillRect(x - 8, y - 12, 16, 11);
    context.fillStyle = "#a8a27a";
    context.fillRect(x - 5, y - 7, 3, 3);
    context.fillRect(x + 3, y - 7, 3, 3);
    context.fillStyle = "#4b5c4a";
    context.fillRect(x - 10, y - 1, 20, 19);
    context.fillStyle = "#7b302d";
    context.fillRect(x - 7, y + 8, 14, 4);
    context.fillStyle = "#202a20";
    context.fillRect(x - 8, y + 18, 6, 6);
    context.fillRect(x + 2, y + 18, 6, 6);
}

function drawProjectile(projectile) {
    context.fillStyle = "#e0c779";
    context.fillRect(
        projectile.x - projectile.radius,
        projectile.y - projectile.radius,
        projectile.radius * 2,
        projectile.radius * 2
    );
}

window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (allowedMovementKeys.has(key)) {
        event.preventDefault();
        keys.add(key);
    }
});

window.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
});

window.addEventListener("blur", () => {
    keys.clear();
});

window.addEventListener("resize", () => {
    if (gameIsRunning) {
        drawGame();
    }
});

updateCamera();
updateHealthBar();
updateExperienceBar();
updateScoreboard();
drawGame();

navigationButtons.forEach((button) => {
    button.addEventListener("click", () => {
        showScreen(button.dataset.screen);
    });
});

displayHighScore();
