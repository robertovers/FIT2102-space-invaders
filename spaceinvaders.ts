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
        vel: number
    }>

    interface IBullet extends GameObject {
        width: number,
        height: number
    }

    interface IPlayer extends GameObject {
        status: number,
    }

    type Bullet = Readonly<IBullet>

    type Player = Readonly<IPlayer>

    type State = Readonly<{
        player: Player,
        bullets: ReadonlyArray<Bullet>,
        objCount: number
    }>

    const initialState: State = {
        player: { 
            id: 'ship',
            x: Constants.initialX, 
            y: Constants.initialY,
            vel: 0,
            status: 0
        },
        bullets: [],
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

    const
        startMoveLeft = keyObservable('keydown', 'ArrowLeft', () => new MoveLeft(true)),
        stopMoveLeft = keyObservable('keyup', 'ArrowLeft', () => new MoveLeft(false)),
        startMoveRight = keyObservable('keydown', 'ArrowRight', () => new MoveRight(true)),
        stopMoveRight = keyObservable('keyup', 'ArrowRight', () => new MoveRight(false)),
        spacePress = keyObservable('keydown', 'ArrowUp', () => new Shoot()),
        mouseClick = fromEvent<MouseEvent>(document, 'mousedown').pipe(map(() => new Shoot())),
        mouseMove = fromEvent<MouseEvent>(document, 'mousemove').pipe(
            filter(({ clientX, clientY }) => 
                clientX > canvasRect.left 
                && clientX < canvasRect.right 
                && clientY > canvasRect.top 
                && clientY < canvasRect.bottom),
            map(({ clientX, clientY }) => new MouseMove({ x: clientX, y: clientY })))
        
    const movePlayer = (p: Player) => <Player>{
        ...p,
        x: p.x + p.vel
    };

    const newBullet = (s: State) => 
        <Bullet>{
            x: s.player.x,
            y: s.player.y,
            id: `bullet${s.objCount}`,
            width: 4,
            height: 10
        };

    const tick = (s: State, elapsed: number) => {
        return <State>{
            ...s, 
            player: movePlayer(s.player)}
    };

    const reduceState = (s: State, e: MouseMove | MoveLeft | MoveRight | Shoot | Tick) =>
        e instanceof MouseMove ? <State>{...s,
            player: {...s.player, x: e.mousePos.x - 10},
        } :
        e instanceof MoveLeft ? <State>{...s,
            player: {...s.player, vel: e.on ? -5 : 0},
        } :
        e instanceof MoveRight ? <State>{...s,
            player: {...s.player, vel: e.on ? 5 : 0}, 
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
                v.setAttribute('width', String(b.width));
                v.setAttribute('height', String(b.height));
                v.setAttribute('fill', 'white');
                v.classList.add('bullet');
                canvas.appendChild(v);
                return v;
            }
            const v = document.getElementById(b.id) || createBulletView();
            v.setAttribute('x', String(b.x));
            v.setAttribute('y', String(b.y));
        })
    }
}

if (typeof window != 'undefined')
    window.onload = () => {
        spaceinvaders();
    }
