import { fromEvent, interval, merge } from 'rxjs';
import { map, filter, scan } from 'rxjs/operators';

function spaceinvaders() {

    const Constants = {
        gameWidth: 600,
        gameHeight: 600,
    } as const;

    class Tick { constructor(public readonly elapsed: number)  { } }
    class MoveLeft { constructor(public readonly on: boolean) { } }
    class MoveRight { constructor(public readonly on: boolean) { } }
    class MouseMove { constructor(public readonly mousePos: {x: number, y: number}) { } }
    class Shoot { constructor() { } }

    type Event = 'keydown' | 'keyup' | 'mousemove';
    type Key = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | ' ';

    type State = Readonly<{
        x: number,
        y: number
        vel: number
    }>

    const initialState: State = {
        x: 300,
        y: 560,
        vel: 0
    }

    const canvas = document.getElementById('canvas')!;
    const ship = document.getElementById('ship')!;

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
        spacePress = keyObservable('keydown', ' ', () => new Shoot()),
        mouseMove = fromEvent<MouseEvent>(document, 'mousemove').pipe(map(({ clientX, clientY }) => new MouseMove({ x: clientX, y: clientY }))),
        mouseClick = fromEvent<MouseEvent>(document, 'mousedown').pipe(map(() => new Shoot()))

    
    const reduceState = (s: State, e: Tick | MoveLeft | MoveRight | MouseMove | Shoot) =>
        e instanceof MouseMove ? {...s,
            x: e.mousePos.x,
        } :
        e instanceof MoveLeft ? {...s,
            vel: e.on ? -5 : 0
        } :
        e instanceof MoveRight ? {...s,
            vel: e.on ? 5 : 0
        } : {...s,
            x: s.x + s.vel
        };

    const subscription =
        merge(
            gameClock,
            mouseMove,
            startMoveLeft, stopMoveLeft,
            startMoveRight, stopMoveRight
        )
        .pipe(
            scan(reduceState, initialState)
        )
        .subscribe(updateView);

    function updateView(s: State) {
        ship.setAttribute('transform', `translate(${s.x},${s.y})`)
    }
}

if (typeof window != 'undefined')
    window.onload = () => {
        spaceinvaders();
    }
