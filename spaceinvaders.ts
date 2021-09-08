import { fromEvent, interval, merge, of } from 'rxjs';
import { map, filter, scan } from 'rxjs/operators';

function spaceinvaders() {

    // constants
    const Constants = {
        GAME_WIDTH: 600,
        GAME_HEIGHT: 600,
        PLAYER_INITIAL_X: 300,
        PLAYER_INITIAL_Y: 550,
        PLAYER_WIDTH: 40,
        PLAYER_HEIGHT: 40,
        BULLET_WIDTH: 2,
        BULLET_HEIGHT: 8,
        ENEMY_WIDTH: 30,
        ENEMY_HEIGHT: 30,
        ENEMY_SPACING: 40,
        SHIELD_SPACING: 105,
        SHIELD_TILE_SIZE: 7,
        DOWN_STEP_FREQ: 500,
        DOWN_STEP_LEN: 20,
        ET_INITIAL_X: 5,
        ET_INITIAL_Y: 40
    } as const;

    // classes
    class Tick { constructor(public readonly elapsed: number) { } }
    class MoveLeft { constructor(public readonly on: boolean) { } }
    class MoveRight { constructor(public readonly on: boolean) { } }
    class MouseMove { constructor(public readonly mousePos: { x: number, y: number }) { } }
    class PlayerShoot { constructor() { } }
    class EnemyShoot { constructor() { } }
    class ResetGame { constructor() { } }

    type Event = 'keydown' | 'keyup' | 'mousemove' | 'mousedown';
    type Key = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'KeyX';

    type GameObject = Readonly<{
        id: string,
        x: number,
        y: number,
        velX: number,
        velY: number,
        objectWidth: number,
        objectHeight: number,
    }>

    interface IEnemy extends GameObject {
        col: number,
        row: number,
        canShoot: boolean
    }

    interface IPlayer extends GameObject {
    }
   
    interface IEnemyTracker extends GameObject {
        enemies: ReadonlyArray<Enemy>
    }

    interface ITile extends GameObject {
        col: number,
        row: number
    }

    interface IShield extends GameObject {
        tiles: ReadonlyArray<Tile>
    }

    interface IShieldTracker extends GameObject {
        shields: ReadonlyArray<Shield>
    }

    type Player = Readonly<IPlayer>

    type Bullet = Readonly<GameObject>

    type Enemy = Readonly<IEnemy>

    type EnemyTracker = Readonly<IEnemyTracker>

    type Tile = Readonly<ITile>

    type Shield = Readonly<IShield>

    type State = Readonly<{
        player: Player,
        bullets: ReadonlyArray<Bullet>,
        shields: ReadonlyArray<Shield>,
        enemyTracker: EnemyTracker,
        objCount: number,
        exit: ReadonlyArray<GameObject>,
        score: number,
        level: number,
        gameStatus: number,
        pseudoRNG: number
    }>

    const
        enemyCols = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        enemyRows = [1, 2, 3, 4, 5],
        enemyRowCols = enemyRows.flatMap(a => enemyCols.map(b => [a, b])),
        tileCols = [1, 2, 3, 4, 5, 6, 7],
        tileRows = [1, 2, 3, 4, 5],
        tileRowCols = tileRows.flatMap(a => tileCols.map(b => [a, b]));

    const initEnemies = () => enemyRowCols.map(coords =>
        <Enemy>{
            id: `enemy${coords[0]}${coords[1]}`,
            x: coords[1] * Constants.ENEMY_SPACING + Constants.ET_INITIAL_X,
            y: coords[0] * Constants.ENEMY_SPACING + Constants.ET_INITIAL_Y,
            col: coords[1],
            row: coords[0],
            canShoot: coords[0] === 5 ? true : false,
            objectWidth: Constants.ENEMY_WIDTH,
            objectHeight: Constants.ENEMY_HEIGHT
        });

    const initTiles = (x: number) => tileRowCols.map(coords =>
        <Tile>{
            id: `tile${coords[0]}${coords[1]}${x}`,
            x: coords[1] * Constants.SHIELD_TILE_SIZE + x,
            y: coords[0] * Constants.SHIELD_TILE_SIZE + 475,
            col: coords[1],
            row: coords[0],
            objectWidth: Constants.SHIELD_TILE_SIZE,
            objectHeight: Constants.SHIELD_TILE_SIZE
        });

    const initShield = (num: number) => <Shield>{
        id: `shield${num}`,
        x: Constants.SHIELD_SPACING * num,
        y: 475,
        velX: 0,
        velY: 0,
        tiles: initTiles(Constants.SHIELD_SPACING * num),
        objectWidth: 0,
        objectHeight: 0
    }

    const initialState: State = {
        player: {
            id: 'ship',
            x: Constants.PLAYER_INITIAL_X,
            y: Constants.PLAYER_INITIAL_Y,
            velX: 0,
            velY: 0,
            objectWidth: Constants.PLAYER_WIDTH,
            objectHeight: Constants.PLAYER_HEIGHT
        },
        bullets: [],
        shields: [1, 2, 3, 4].map(initShield),
        enemyTracker: {
            id: 'enemyTracker',
            x: Constants.ET_INITIAL_X,
            y: Constants.ET_INITIAL_Y,
            velX: 0.3,
            velY: 0.6,
            enemies: initEnemies(),
            objectWidth: Constants.ENEMY_WIDTH,
            objectHeight: Constants.ENEMY_HEIGHT
        },
        objCount: 0,
        exit: [],
        score: 0,
        level: 1,
        gameStatus: 0,
        pseudoRNG: 17
    };

    // html elements
    const
        canvas = document.getElementById('canvas')!,
        ship = document.getElementById('ship')!,
        canvasRect = canvas.getBoundingClientRect();

    // from Observable Asteroids
    const keyObservable = <T>(e: Event, k: Key, result: () => T) =>
        fromEvent<KeyboardEvent>(document, e)
            .pipe(
                filter(({ code }) => code === k),
                filter(({ repeat }) => !repeat),
                map(result));

    const mouseOnCanvas = ({ clientX, clientY }: MouseEvent) =>
        clientX > canvasRect.left &&
        clientX < canvasRect.right &&
        clientY > canvasRect.top &&
        clientY < canvasRect.bottom;

    // observable streams
    const
        startMoveLeft = keyObservable('keydown', 'ArrowLeft', () => new MoveLeft(true)),
        stopMoveLeft = keyObservable('keyup', 'ArrowLeft', () => new MoveLeft(false)),
        startMoveRight = keyObservable('keydown', 'ArrowRight', () => new MoveRight(true)),
        stopMoveRight = keyObservable('keyup', 'ArrowRight', () => new MoveRight(false)),
        keyShoot = keyObservable('keydown', 'KeyX', () => new PlayerShoot()),
        mouseClick = fromEvent<MouseEvent>(document, 'mousedown').pipe(
            filter(mouseOnCanvas),
            map(() => new PlayerShoot())),
        mouseMove = fromEvent<MouseEvent>(document, 'mousemove').pipe(
            filter(mouseOnCanvas),
            map(({ clientX, clientY }) => new MouseMove({ x: clientX - Constants.PLAYER_WIDTH / 2, y: clientY }))),
        gameClock = interval(10).pipe(map(elapsed => new Tick(elapsed))),
        enemyShootStream = interval(2000).pipe(map(() => new EnemyShoot())),
        reset = fromEvent<MouseEvent>(document, 'mousedown').pipe(
            filter(mouseOnCanvas),
            map(() => new ResetGame()));

    /**
     * 
     * @param p 
     * @returns 
     */
    const movePlayer = (p: Player) => <Player>{
        ...p,
        x: p.x + p.velX,
    };

    /**
     * 
     * @param b 
     * @returns 
     */
    const moveBullet = (b: Bullet) => <GameObject>{
        ...b,
        y: b.y + b.velY
    };

    /**
     * 
     * @param et 
     * @returns 
     */
    const moveEnemy = (et: EnemyTracker) => (e: Enemy) => <Enemy>{
        ...e,
        x: et.x + e.col * Constants.ENEMY_SPACING,
        y: et.y + e.row * Constants.ENEMY_SPACING
    };

    /**
     * 
     * @param et 
     * @returns 
     */
    const moveEnemies = (et: EnemyTracker, elapsed: number) => <EnemyTracker>{
        ...et,
        x: et.x > 90 ? 89 : et.x < 10 ? 11 : et.x + et.velX,
        y: elapsed > Constants.DOWN_STEP_FREQ
            && elapsed % Constants.DOWN_STEP_FREQ > 0
            && elapsed % Constants.DOWN_STEP_FREQ < Constants.DOWN_STEP_LEN
            ? et.y + et.velY : et.y,
        velX: et.x > 90 || et.x < 10 ? (-1) * et.velX : et.velX,
        enemies: et.enemies.map(moveEnemy(et))
    };

    /**
     * 
     * @param s 
     * @returns 
     */
    const enemiesThatShoot = (s: State) => 
        s.enemyTracker.enemies.filter(e => e.canShoot === true);

    /**
     * 
     * @param s 
     * @returns 
     */
    const randEnemyThatShoots = (s: State) => {
        const randEnemy = s.pseudoRNG % enemiesThatShoot(s).length; 
        return enemiesThatShoot(s)[randEnemy];
    };

    /**
     * 
     * @param s 
     * @returns 
     */
    const newEnemyBullet = (s: State) => {
        const randEnemy = randEnemyThatShoots(s);
        return <GameObject>{
            id: `bullet${s.objCount}`,
            x: randEnemy.x + (Constants.ENEMY_WIDTH / 2),
            y: randEnemy.y + Constants.ENEMY_HEIGHT + 2, 
            velX: 0,
            velY: 5,
            objectWidth: 2,
            objectHeight: 5
        };
    };

    /**
     * 
     * @param s 
     * @returns 
     */
     const newPlayerBullet = (s: State) => <GameObject>{
        id: `bullet${s.objCount}`,
        x: s.player.x + Constants.PLAYER_WIDTH / 2 - 1,
        y: s.player.y - 15,
        velX: 0,
        velY: -5,
        objectWidth: 2,
        objectHeight: 5
    };

    /**
     * 
     * @param b 
     * @returns 
     */
    const bulletOnCanvas = (b: Bullet) =>
        b.x <= Constants.GAME_WIDTH &&
        b.y <= Constants.GAME_HEIGHT &&
        b.x >= 0 &&
        b.y + 20 >= 0;

    /**
     * Adapted from observalble asteroids
     * @param s 
     * @returns 
     */
    const clearObjects = (s: State) => {
        s.exit.concat(s.bullets, s.enemyTracker.enemies)
            .map(o => document.getElementById(o.id))
            .filter(o => o !== null && o !== undefined)
            .forEach(v => {
                try {
                    canvas.removeChild(v!)
                } catch (e) {
                    console.log("Already removed: " + v!.id)
                }
            });
        document.getElementById('gameover')!.innerHTML = 'GAME OVER<br/>click screen to reset';
        return initialState; 
    }

    /**
     * 
     * @param s 
     * @returns 
     */
    const handleCollisions = (s: State) => {

        /**
         * Determines if there is a collision between a Bullet and another GameObject.
         * @param param0 
         * @returns 
         */
        const objectCollision = ([i, j]: [GameObject, GameObject]) =>
            i.x + i.objectWidth > j.x &&
            i.x < j.x + j.objectWidth &&
            i.y + i.objectHeight > j.y &&
            i.y < j.y + j.objectHeight;

        const
            // from Observable Asteroids
            allBulletsAndEnemies = s.bullets.flatMap(b => s.enemyTracker.enemies.map(e => <[Bullet, Enemy]>[b, e])),
            allBulletsAndPlayer = s.bullets.map(b => <[Bullet, Player]>[b, s.player]),
            allBulletsAndTiles = s.bullets.flatMap(b => s.shields.flatMap(s => s.tiles.map(t => <[Bullet, Tile]>[b, t]))),
            collidedBulletsEnemies = allBulletsAndEnemies.filter(objectCollision),
            collidedBulletsTiles = allBulletsAndTiles.filter(objectCollision),
            playerCollided = allBulletsAndPlayer.filter(objectCollision).length > 0 
                || s.enemyTracker.enemies.filter(e => e.y > 530).length > 0,
            collidedEnemies = collidedBulletsEnemies.map(([_, enemy]) => enemy),
            collidedTiles = collidedBulletsTiles.map(([_, tile]) => tile),
            collidedBullets = collidedBulletsEnemies.map(([bullet, _]) => bullet)
                .concat(collidedBulletsTiles.map(([bullet, _]) => bullet)),
            cutEnemies = except((a: Enemy) => (b: Enemy) => a.id === b.id),
            cutBullets = except((a: Bullet) => (b: Bullet) => a.id === b.id),
            cutTiles = except((a: Tile) => (b: Tile) => a.id === b.id),
            enemiesInCol = (s: State, col: number) => s.enemyTracker.enemies.filter(e => e.col === col),
            lowerInCol = (e: Enemy, f: Enemy) => e.row > f.row ? e : f,
            lowestInCol = (s: State, col: number) => enemiesInCol(s, col).reduce(lowerInCol),
            noEnemies = (s: State) => s.enemyTracker.enemies.length === 0;

        if (playerCollided) clearObjects(s);

        return playerCollided ?
            <State>{
                ...s,
                gameStatus: 1
            } :
            <State>{
                ...s,
                bullets: noEnemies(s) ? [] : cutBullets(s.bullets)(collidedBullets),
                shields: s.shields.map(sh => <Shield>{
                    ...sh,
                    tiles: cutTiles(sh.tiles)(collidedTiles)
                }),
                exit: noEnemies(s) ? s.exit.concat(s.bullets) : s.exit.concat(collidedBullets, collidedEnemies, collidedTiles),
                enemyTracker: {
                    ...s.enemyTracker,
                    x: noEnemies(s) ? Constants.ET_INITIAL_X : s.enemyTracker.x,
                    y: noEnemies(s) ? Constants.ET_INITIAL_Y : s.enemyTracker.y,
                    enemies: noEnemies(s) ? initEnemies()
                        : cutEnemies(s.enemyTracker.enemies.map(e =>
                            e.row === lowestInCol(s, e.col).row ? <Enemy>{...e, canShoot: true } : e))(collidedEnemies),
                },
                score: s.score + collidedEnemies.length * 10,
                level: noEnemies(s) ? s.level + 1 : s.level
            };
    }

    /**
     * 
     * @param s 
     * @param elapsed 
     * @returns 
     */
    const tick = (s: State, elapsed: number) => {
        const
            offCanvasBullets = s.bullets.filter(b => !bulletOnCanvas(b)),
            onCanvasBullets = s.bullets.filter(bulletOnCanvas);
        return handleCollisions(<State>{
            ...s,
            player: movePlayer(s.player),
            bullets: onCanvasBullets.map(moveBullet),
            enemyTracker: moveEnemies(s.enemyTracker, elapsed),
            exit: offCanvasBullets,
            pseudoRNG: s.pseudoRNG * (s.player.x + s.bullets.length) % 1111111  // dumb pseudo-random number generator
        });
    };

    /**
     * 
     * @param s 
     * @param e 
     * @returns 
     */
    const reduceState = (s: State, e: MouseMove | MoveLeft | MoveRight | PlayerShoot | EnemyShoot | Tick | ResetGame) =>
        e instanceof MouseMove ? <State>{
            ...s,
            player: { ...s.player, x: e.mousePos.x - 10},
        } :
        e instanceof MoveLeft ? <State>{
            ...s,
            player: { ...s.player, velX: e.on ? -5 : 0 },
        } :
        e instanceof MoveRight ? <State>{
            ...s,
            player: { ...s.player, velX: e.on ? 5 : 0 },
        } :
        e instanceof PlayerShoot ? <State>{
            ...s,
            bullets: s.bullets.concat(newPlayerBullet(s)),
            objCount: s.objCount + 1
        } :
        e instanceof EnemyShoot ? <State>{
            ...s,
            bullets: enemiesThatShoot(s).length > 0 ? s.bullets.concat(newEnemyBullet(s)) : s.bullets,
            objCount: s.objCount + 1
        } 
        : e instanceof ResetGame ? s.gameStatus === 1 ? initialState : s
        : tick(s, e.elapsed);

    /**
     * 
     */
    const subscription =
        merge(
            gameClock,
            enemyShootStream,
            mouseMove, mouseClick,
            startMoveLeft, stopMoveLeft,
            startMoveRight, stopMoveRight,
            keyShoot,
            reset
        )
        .pipe(
            scan(reduceState, initialState),
            filter(s => s.gameStatus != 1)
        )
        .subscribe(updateView);

    /**
     * 
     * @param s 
     */
    function updateView(s: State) {
        document.getElementById('gameover')!.innerHTML = '';
        document.getElementById('score')!.innerHTML = `SCORE: ${String(s.score)}`;
        document.getElementById('level')!.innerHTML = `LEVEL: ${String(s.level)}`;
        // from Observable Asteroids
        ship.setAttribute('transform', `translate(${s.player.x}, ${s.player.y})`);
        s.bullets.forEach(b => {
            const createBulletView = () => {
                const v = document.createElementNS(canvas.namespaceURI, 'rect')!;
                v.setAttribute('id', b.id);
                v.setAttribute('width', String(b.objectWidth));
                v.setAttribute('height', String(b.objectHeight));
                v.setAttribute('fill', 'white');
                canvas.appendChild(v);
                return v;
            }
            const v = document.getElementById(b.id) || createBulletView();
            v.setAttribute('x', String(b.x));
            v.setAttribute('y', String(b.y));
        });
        s.enemyTracker.enemies.forEach(e => {
            const createEnemyView = () => {
                const v = document.createElementNS(canvas.namespaceURI, 'image')!;
                v.setAttribute('id', e!.id);
                v.setAttribute('width', String(e.objectWidth));
                v.setAttribute('height', String(e.objectHeight));
                v.setAttribute('href', 'assets/alien.png');
                canvas.appendChild(v);
                return v;
            }
            const v = document.getElementById(e!.id) || createEnemyView();
            v.setAttribute('x', String(e!.x));
            v.setAttribute('y', String(e!.y));
        });
        s.shields.forEach(sh => sh.tiles.forEach(t => {
            const createTileView = () => {
                const v = document.createElementNS(canvas.namespaceURI, 'rect')!;
                v.setAttribute('id', t!.id);
                v.setAttribute('width', String(t.objectWidth));
                v.setAttribute('height', String(t.objectHeight));
                v.setAttribute('fill', 'pink');
                canvas.appendChild(v);
                return v;
            }
            const v = document.getElementById(t!.id) || createTileView();
            v.setAttribute('x', String(t!.x));
            v.setAttribute('y', String(t!.y));
        }));
        s.exit.map(o => document.getElementById(o.id))
            .filter(o => o !== null && o !== undefined)
            .forEach(v => {
                try {
                    canvas.removeChild(v!)
                } catch (e) {
                    console.log("Already removed: " + v!.id)
                }
            });
    }
}

if (typeof window != 'undefined')
    window.onload = () => {
        spaceinvaders();
    }


// === utility ===

// from Observable Asteroids
const
    not = <T>(f: (x: T) => boolean) => (x: T) => !f(x),
    elem =
        <T>(eq: (_: T) => (_: T) => boolean) =>
            (a: ReadonlyArray<T>) =>
                (e: T) => a.findIndex(eq(e)) >= 0,
    except =
        <T>(eq: (_: T) => (_: T) => boolean) =>
            (a: ReadonlyArray<T>) =>
                (b: ReadonlyArray<T>) => a.filter(not(elem(eq)(b)))