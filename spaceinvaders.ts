import { fromEvent, interval, merge } from 'rxjs';
import { map, filter, scan } from 'rxjs/operators';

function spaceinvaders() {
    // Inside this function you will use the classes and functions
    // from rx.js
    // to add visuals to the svg element in pong.html, animate them, and make them interactive.
    // Study and complete the tasks in observable exampels first to get ideas.
    // Course Notes showing Asteroids in FRP: https://tgdwyer.github.io/asteroids/
    // You will be marked on your functional programming style
    // as well as the functionality that you implement.
    // Document your code!

    class Tick { constructor(public readonly elapsed: number)  { } }
    class MoveLeft { constructor(public readonly on: boolean) { } }
    class MoveRight { constructor(public readonly on: boolean) { } }
    class MouseMove { constructor(public readonly mousePos: {x: number, y: number}) { } }

    type Event = 'keydown' | 'keyup' | 'mousemove'
    type Key = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp'
 
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

    const gameClock = interval(10)
        .pipe(map(elapsed => new Tick(elapsed)))

    // from Asteroids
    const keyObservable = <T>(e: Event, k: Key, result: () => T) =>
        fromEvent<KeyboardEvent>(document, e)
            .pipe(
                filter(({ code }) => code === k),
                filter(({ repeat }) => !repeat),
                map(result))

    const
        startMoveLeft = keyObservable('keydown', 'ArrowLeft', () => new MoveLeft(true)),
        stopMoveLeft = keyObservable('keyup', 'ArrowLeft', () => new MoveLeft(false)),
        startMoveRight = keyObservable('keydown', 'ArrowRight', () => new MoveRight(true)),
        stopMoveRight = keyObservable('keyup', 'ArrowRight', () => new MoveRight(false)),
        mouseMove = fromEvent<MouseEvent>(document, 'mousemove').pipe(map(({ clientX, clientY }) => new MouseMove({ x: clientX, y: clientY })))

    const reduceState = (s: State, e: Tick | MoveLeft | MoveRight | MouseMove) => 
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
        .subscribe(updateView)
    
    function updateView(s: State) {
        const ship = document.getElementById("ship")!
        ship.setAttribute('transform', `translate(${s.x},${s.y})`)
    }
}

// the following simply runs your pong function on window load.  Make sure to leave it in place.
if (typeof window != 'undefined')
    window.onload = () => {
        spaceinvaders();
    }
