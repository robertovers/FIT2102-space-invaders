import { empty, fromEvent, interval, merge, of } from 'rxjs';
import { map, filter, scan } from 'rxjs/operators';

function spaceinvaders() {

    const Constants = {
        gameWidth: 600,
        gameHeight: 600,
        initialX: 300,
        initialY: 560
    } as const;

    class Tick { constructor(public readonly elapsed: number) { } }
    class MoveLeft { constructor(public readonly on: boolean) { } }
    class MoveRight { constructor(public readonly on: boolean) { } }
    class MouseMove { constructor(public readonly mousePos: { x: number, y: number }) { } }
    class PlayerShoot { constructor() { } }
    class EnemyShoot { constructor() { } }

    type Event = 'keydown' | 'keyup' | 'mousemove' | 'mousedown';
    type Key = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp';

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

    type Player = Readonly<IPlayer>

    type Bullet = Readonly<GameObject>

    type Enemy = Readonly<IEnemy>

    interface IEnemies extends GameObject {
        enemies: ReadonlyArray<Enemy>
    }

    type EnemyTracker = Readonly<IEnemies>

    type State = Readonly<{
        player: Player,
        bullets: ReadonlyArray<Bullet>,
        enemyTracker: EnemyTracker,
        objCount: number,
        exit: ReadonlyArray<GameObject>
    }>

    const
        enemyCols = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        enemyRows = [1, 2, 3, 4, 5],
        enemyRowCols = enemyRows.flatMap(a => enemyCols.map(b => [a, b]));

    const initEnemies = () => enemyRowCols.map(coords =>
        <Enemy>{
            id: `enemy${coords[0]}${coords[1]}`,
            x: coords[1] * 40,
            y: coords[0] * 40,
            col: coords[1],
            row: coords[0],
            canShoot: coords[0] === 5 ? true : false
        });

    const initialState: State = {
        player: {
            id: 'ship',
            x: Constants.initialX,
            y: Constants.initialY,
            velX: 0,
            velY: 0,
            status: 0
        },
        bullets: [],
        enemyTracker: {
            id: 'enemyTracker',
            x: 10,
            y: 20,
            velX: 0.5,
            velY: 0,
            enemies: initEnemies()
        },
        objCount: 0,
        exit: []
    };

    const rng = new RNG(20);

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
        spacePress = keyObservable('keydown', 'ArrowUp', () => new PlayerShoot()),
        mouseClick = fromEvent<MouseEvent>(document, 'mousedown').pipe(
            filter(mouseOnCanvas),
            map(() => new PlayerShoot())),
        mouseMove = fromEvent<MouseEvent>(document, 'mousemove').pipe(
            filter(mouseOnCanvas),
            map(({ clientX, clientY }) => new MouseMove({ x: clientX, y: clientY }))),
        gameClock = interval(10).pipe(map(elapsed => new Tick(elapsed))),
        enemyShootStream = interval(2000).pipe(map(() => new EnemyShoot()));

    const
        movePlayer = (p: Player) => <Player>{
            ...p,
            x: p.x + p.velX,
        },
        moveBullet = (b: Bullet) => <GameObject>{
            ...b,
            y: b.y + b.velY
        },
        moveEnemy = (et: EnemyTracker) => (e: Enemy) => <Enemy>{
            ...e,
            x: et.x + e.col * 40,
            y: et.y + e.row * 40
        },
        moveEnemies = (et: EnemyTracker) => <EnemyTracker>{
            ...et,
            x: et.x > 90 ? 89 : et.x < 10 ? 11 : et.x + et.velX,
            y: et.y + et.velY,
            velX: et.x > 90 || et.x < 10 ? (-1) * et.velX : et.velX,
            enemies: et.enemies.map(moveEnemy(et))
        };

    const randEnemyThatShoots = (s: State) => {
        const enemiesThatShoot = s.enemyTracker.enemies.filter(e => e.canShoot === true);
        const randEnemy = rng.nextInt() % (enemiesThatShoot.length);
        console.log(randEnemy, enemiesThatShoot[randEnemy]);
        return enemiesThatShoot.length > 0 ? enemiesThatShoot[randEnemy] : s.enemyTracker.enemies[0];
    }

    const
        newPlayerBullet = (s: State) =>
            <GameObject>{
                id: `bullet${s.objCount}`,
                x: s.player.x - 1,
                y: s.player.y - 15,
                velX: 0,
                velY: -5
            },
        newEnemyBullet = (s: State) => {
            const randEnemy = randEnemyThatShoots(s);
            return <GameObject>{
                    id: `bullet${s.objCount}`,
                    x: randEnemy.x + 10,
                    y: randEnemy.y + 20,
                    velX: 0,
                    velY: 3
                }
            };

    const bulletOnCanvas = (b: Bullet) =>
        b.x <= Constants.gameWidth &&
        b.y <= Constants.gameHeight &&
        b.x >= 0 &&
        b.y + 20 >= 0;

    const handleCollisions = (s: State) => {
        const objectCollision = ([i, j]: [GameObject, GameObject]) =>
            i.x > j.x &&
            i.x < j.x + 20 &&
            i.y > j.y &&
            i.y < j.y + 20;
        const
            // from Observable Asteroids
            allBulletsAndEnemies = s.bullets.flatMap(b => s.enemyTracker.enemies.map(e => <[GameObject, Enemy]>[b, e])),
            collided = allBulletsAndEnemies.filter(objectCollision),
            collidedBullets = collided.map(([bullet, _]) => bullet),
            collidedEnemies = collided.map(([_, enemy]) => enemy),
            cutBullets = except((a: Bullet) => (b: Bullet) => a.id === b.id),
            cutEnemies = except((a: Enemy) => (b: Enemy) => a.id === b.id),
            enemiesInCol = (s: State, col: number) => s.enemyTracker.enemies.filter(e => e.col === col),
            lowerInCol = (e: Enemy, f: Enemy) => e.row > f.row ? e : f,
            lowestInCol = (s: State, col: number) => enemiesInCol(s, col).reduce(lowerInCol);
        return <State>{
            ...s,
            bullets: cutBullets(s.bullets)(collidedBullets),
            exit: s.exit.concat(collidedBullets, collidedEnemies),
            enemyTracker: {
                ...s.enemyTracker,
                enemies: cutEnemies(s.enemyTracker.enemies.map(e => e.row === lowestInCol(s, e.col).row ? <Enemy>{...e, canShoot: true} : e))(collidedEnemies)
            }
        }
    }

    const tick = (s: State, elapsed: number) => {
        const
            offCanvasBullets = s.bullets.filter(b => !bulletOnCanvas(b)),
            onCanvasBullets = s.bullets.filter(bulletOnCanvas);
        return handleCollisions({
            ...s,
            player: movePlayer(s.player),
            bullets: onCanvasBullets.map(moveBullet),
            enemyTracker: moveEnemies(s.enemyTracker),
            exit: offCanvasBullets
        })
    };

    const reduceState = (s: State, e: MouseMove | MoveLeft | MoveRight | PlayerShoot | EnemyShoot | Tick) =>
        e instanceof MouseMove ? <State>{
            ...s,
            player: { ...s.player, x: e.mousePos.x - 10 },
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
            bullets: s.bullets.concat(newEnemyBullet(s)),
            objCount: s.objCount + 1
        }
        : tick(s, e.elapsed);

    const subscription =
        merge(
            gameClock,
            enemyShootStream,
            mouseMove, mouseClick,
            startMoveLeft, stopMoveLeft,
            startMoveRight, stopMoveRight,
            spacePress
        )
        .pipe(
            scan(reduceState, initialState)
        )
        .subscribe(updateView);

    function updateView(s: State) {
        // from Observable Asteroids
        ship.setAttribute('transform', `translate(${s.player.x},${s.player.y})`);
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
                const v = document.createElementNS(canvas.namespaceURI, 'rect')!;
                v.setAttribute('id', e!.id);
                v.setAttribute('width', String(20));
                v.setAttribute('height', String(20));
                v.setAttribute('fill', 'lightgreen');
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

// RNG class from Week 4 observableexamples.ts
class RNG {

    m = 0x80000000; // 2**31
    a = 1103515245;
    c = 12345;
    state: number

    constructor(seed: number) {
        this.state = seed ? seed : Math.floor(Math.random() * (this.m - 1));
    }

    nextInt() {
        this.state = (this.a * this.state + this.c) % this.m;
        return this.state;
    }

    nextFloat() {
        return this.nextInt() / (this.m - 1);
    }
}

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