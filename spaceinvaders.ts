import { fromEvent, interval, merge } from 'rxjs';
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

    interface IPlayer extends GameObject {
        status: number,
    }

    type Player = Readonly<IPlayer>

    type Bullet = Readonly<GameObject>
    
    interface IEnemies extends GameObject {
        enemies: ReadonlyArray<GameObject | null> 
    }

    type EnemyTracker = Readonly<IEnemies>

    type State = Readonly<{
        player: Player,
        bullets: ReadonlyArray<GameObject>,
        enemyTracker: EnemyTracker,
        objCount: number
    }>
    
    const nullEnemies: ReadonlyArray<GameObject | null> = [
        null, null, null, null,
        null, null, null, null 
    ]

    const initialiseEnemies = (s: State) => s.enemyTracker.enemies.map(e => 
        <GameObject>{
            id: `enemy${s.objCount}`,
            x: 0,
            y: 0,
            velX: 0,
            velY: 0
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
            x: 0,
            y: 0,
            velX: 0,
            velY: 0,
            enemies: nullEnemies 
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
            enemyTracker: {
                ...s.enemyTracker,
                enemies: nullEnemies ? initialiseEnemies(s) : s.enemyTracker.enemies
            }
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
