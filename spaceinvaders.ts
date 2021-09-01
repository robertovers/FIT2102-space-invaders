import { fromEvent, interval, merge, of } from 'rxjs';
import { map, filter, scan } from 'rxjs/operators';

function spaceinvaders() {

    const Constants = {
        gameWidth: 600,
        gameHeight: 600,
        initialX: 300,
        initialY: 560
    } as const;

    class Tick { constructor(public readonly elapsed: number)  { } }
    class MoveLeft { constructor(public readonly on: boolean) { } }
    class MoveRight { constructor(public readonly on: boolean) { } }
    class MouseMove { constructor(public readonly mousePos: {x: number, y: number}) { } }
    class Shoot { constructor() { } }

    type Event = 'keydown' | 'keyup' | 'mousemove' | 'mousedown';
    type Key = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp';

    type GameObject = Readonly<{
        id: string,
        x: number,
        y: number,
        velX: number,
        velY: number
    }>

    type Enemy = {
        id: string,
        x: number,
        y: number,
        col: number,
        row: number
    }

    interface IPlayer extends GameObject {
        status: number,
    }

    type Player = Readonly<IPlayer>

    type Bullet = Readonly<GameObject>
    
    interface IEnemies extends GameObject {
        enemies: ReadonlyArray<Enemy | null> 
    }

    type EnemyTracker = Readonly<IEnemies>

    type State = Readonly<{
        player: Player,
        bullets: ReadonlyArray<Bullet>,
        enemyTracker: EnemyTracker,
        objCount: number
    }>
    
    const nullEnemies: ReadonlyArray<Enemy | null> = [
        null, null, null, null,
        null, null, null, null 
    ]

    const 
        enemyCols = [1,2,3,4,5,6,7,8,9,10,11],
        enemyRows = [1,2,3,4,5],
        enemyRowCols = enemyRows.flatMap(a => enemyCols.map(b => [a, b]));

    const initEnemies = () => enemyRowCols.map(coords => 
        <Enemy>{
            id: `enemy${coords[0]}${coords[1]}`,
            x: coords[1] * 40,
            y: coords[0] * 40,
            col: coords[1],
            row: coords[0] 
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
        objCount: 0
    };

    const 
        canvas = document.getElementById('canvas')!,
        ship = document.getElementById('ship')!,
        canvasRect = canvas.getBoundingClientRect();

    const gameClock = interval(10)
        .pipe(map(elapsed => new Tick(elapsed)));

    // from Asteroids
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
    
    const
        startMoveLeft = keyObservable('keydown', 'ArrowLeft', () => new MoveLeft(true)),
        stopMoveLeft = keyObservable('keyup', 'ArrowLeft', () => new MoveLeft(false)),
        startMoveRight = keyObservable('keydown', 'ArrowRight', () => new MoveRight(true)),
        stopMoveRight = keyObservable('keyup', 'ArrowRight', () => new MoveRight(false)),
        spacePress = keyObservable('keydown', 'ArrowUp', () => new Shoot()),
        mouseClick = fromEvent<MouseEvent>(document, 'mousedown').pipe(
            filter(mouseOnCanvas),
            map(() => new Shoot())),
        mouseMove = fromEvent<MouseEvent>(document, 'mousemove').pipe(
            filter(mouseOnCanvas),
            map(({ clientX, clientY }) => new MouseMove({ x: clientX, y: clientY })));
        
    const movePlayer = (p: Player) => <Player>{
        ...p,
        x: p.x + p.velX,
    };

    const moveBullet = (b: Bullet) => <GameObject>{
        ...b,
        y: b.y + b.velY
    };

    const moveEnemy = (et: EnemyTracker) => (e: Enemy | null) => e ? <Enemy>{
        ...e,
        x: et.x + e.col * 40,
        y: et.y + e.row * 40
    } : null;

    const moveEnemies = (et: EnemyTracker) => <EnemyTracker>{
        ...et,
        x: et.x > 90 ? 89 : et.x < 10 ? 11 : et.x + et.velX,
        y: et.y + et.velY,
        velX: et.x > 90 || et.x < 10 ? (-1) * et.velX : et.velX, 
        enemies: et.enemies.map(moveEnemy(et))
    }

    const newBullet = (s: State) => 
        <GameObject>{
            id: `bullet${s.objCount}`,
            x: s.player.x,
            y: s.player.y,
            velX: 0,
            velY: -5
        };

    const coordsInCanvas = (x: number, y: number) =>
        x <= Constants.gameWidth &&
        y <= Constants.gameHeight &&
        x >= 0 &&
        y >= 0;

    const tick = (s: State, elapsed: number) => {
        return <State>{
            ...s, 
            player: movePlayer(s.player),
            bullets: s.bullets.map(moveBullet).filter(b => coordsInCanvas(b.x, b.y + 20)).reduce((l: ReadonlyArray<GameObject>, b) => l.concat(b), []),
            enemyTracker: moveEnemies(s.enemyTracker)
        }
    };

    const reduceState = (s: State, e: MouseMove | MoveLeft | MoveRight | Shoot | Tick) =>
        e instanceof MouseMove ? <State>{...s,
            player: {...s.player, x: e.mousePos.x - 10},
        } :
        e instanceof MoveLeft ? <State>{...s,
            player: {...s.player, velX: e.on ? -5 : 0},
        } :
        e instanceof MoveRight ? <State>{...s,
            player: {...s.player, velX: e.on ? 5 : 0}, 
        } : 
        e instanceof Shoot ? <State>{...s,
            bullets: s.bullets.concat(newBullet(s)),
            objCount: s.objCount + 1
        }
        : tick(s, e.elapsed);

    const subscription =
        merge(
            gameClock,
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
        ship.setAttribute('transform', `translate(${s.player.x},${s.player.y})`);
        s.bullets.forEach(b => {
            const createBulletView = () => {
                const v = document.createElementNS(canvas.namespaceURI, 'rect')!;
                v.setAttribute('id', b.id);
                v.setAttribute('width', String(2));
                v.setAttribute('height', String(8));
                v.setAttribute('fill', 'white');
                //v.classList.add('bullet');
                canvas.appendChild(v);
                return v;
            }
            const v = document.getElementById(b.id) || createBulletView();
            v.setAttribute('x', String(b.x));
            v.setAttribute('y', String(b.y));
            });
        s.enemyTracker.enemies.filter(e => e !== null).forEach(e => {
            const createEnemyView = () => {
                const v = document.createElementNS(canvas.namespaceURI, 'rect')!;
                v.setAttribute('id', e!.id);
                v.setAttribute('width', String(20));
                v.setAttribute('height', String(20));
                v.setAttribute('fill', 'white');
                //v.classList.add('enemy');
                canvas.appendChild(v);
                return v;
            }
            const v = document.getElementById(e!.id) || createEnemyView();
            v.setAttribute('x', String(e!.x));
            v.setAttribute('y', String(e!.y));
            });
        }
    }

if (typeof window != 'undefined')
    window.onload = () => {
        spaceinvaders();
    }
