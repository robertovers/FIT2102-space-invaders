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
        ENEMY_WIDTH: 30,
        ENEMY_HEIGHT: 30,
        ENEMY_SPACING: 40,
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
    }>

    interface IEnemy extends GameObject {
        col: number,
        row: number,
        canShoot: boolean
    }

    interface IPlayer extends GameObject {
        status: number,
    }
   
    interface IEnemies extends GameObject {
        enemies: ReadonlyArray<Enemy>
    }

    interface IShield extends GameObject {

    }

    type Player = Readonly<IPlayer>

    type Bullet = Readonly<GameObject>

    type Enemy = Readonly<IEnemy>

    type EnemyTracker = Readonly<IEnemies>

    type State = Readonly<{
        player: Player,
        bullets: ReadonlyArray<Bullet>,
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
        enemyRowCols = enemyRows.flatMap(a => enemyCols.map(b => [a, b]));

    const initEnemies = () => enemyRowCols.map(coords =>
        <Enemy>{
            id: `enemy${coords[0]}${coords[1]}`,
            x: coords[1] * Constants.ENEMY_SPACING + Constants.ET_INITIAL_X,
            y: coords[0] * Constants.ENEMY_SPACING + Constants.ET_INITIAL_Y,
            col: coords[1],
            row: coords[0],
            canShoot: coords[0] === 5 ? true : false
        });

    const initialState: State = {
        player: {
            id: 'ship',
            x: Constants.PLAYER_INITIAL_X,
            y: Constants.PLAYER_INITIAL_Y,
            velX: 0,
            velY: 0,
            status: 0
        },
        bullets: [],
        enemyTracker: {
            id: 'enemyTracker',
            x: Constants.ET_INITIAL_X,
            y: Constants.ET_INITIAL_Y,
            velX: 0.3,
            velY: 0.6,
            enemies: initEnemies()
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
    const newPlayerBullet = (s: State) => <GameObject>{
        id: `bullet${s.objCount}`,
        x: s.player.x + Constants.PLAYER_WIDTH / 2 - 1,
        y: s.player.y - 15,
        velX: 0,
        velY: -5
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
            velY: 5
        };
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
         * 
         * @param param0 
         * @returns 
         */
        const objectCollision = ([i, j]: [GameObject, GameObject]) =>
            i.x > j.x &&
            i.x < j.x + Constants.ENEMY_WIDTH &&
            i.y > j.y &&
            i.y < j.y + Constants.ENEMY_HEIGHT;

        const
            // from Observable Asteroids
            allBulletsAndEnemies = s.bullets.flatMap(b => s.enemyTracker.enemies.map(e => <[GameObject, Enemy]>[b, e])),
            allBulletsAndPlayer = s.bullets.map(b => <[GameObject, GameObject]>[b, s.player]),
            collided = allBulletsAndEnemies.filter(objectCollision),
            playerCollided = allBulletsAndPlayer.filter(objectCollision).length > 0,
            collidedBullets = collided.map(([bullet, _]) => bullet),
            collidedEnemies = collided.map(([_, enemy]) => enemy),
            cutBullets = except((a: Bullet) => (b: Bullet) => a.id === b.id),
            cutEnemies = except((a: Enemy) => (b: Enemy) => a.id === b.id),
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
                exit: noEnemies(s) ? s.exit.concat(s.bullets) : s.exit.concat(collidedBullets, collidedEnemies),
                enemyTracker: {
                    ...s.enemyTracker,
                    x: noEnemies(s) ? Constants.ET_INITIAL_X : s.enemyTracker.x,
                    y: noEnemies(s) ? Constants.ET_INITIAL_Y : s.enemyTracker.y,
                    enemies: noEnemies(s) ? initEnemies()
                        : cutEnemies(s.enemyTracker.enemies.map(e =>
                            e.row === lowestInCol(s, e.col).row ? <Enemy>{ ...e, canShoot: true } : e))(collidedEnemies),
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
            pseudoRNG: s.pseudoRNG * (s.player.x + s.bullets.length) % 1111111 
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
                v.setAttribute('width', String(2));
                v.setAttribute('height', String(8));
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
                v.setAttribute('width', String(Constants.ENEMY_WIDTH));
                v.setAttribute('height', String(Constants.ENEMY_HEIGHT));
                v.setAttribute('href', 'assets/alien.png');
                canvas.appendChild(v);
                return v;
            }
            const v = document.getElementById(e!.id) || createEnemyView();
            v.setAttribute('x', String(e!.x));
            v.setAttribute('y', String(e!.y));
        });
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