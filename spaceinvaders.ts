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

    class Tick { constructor(public readonly elapsed: number) { } }
    
    class MoveLeft { constructor(public readonly on: boolean) { } }
    
    class MoveRight { constructor(public readonly on: boolean) { } }
    
    class MouseMove { constructor(public readonly mousePos: { x: number, y: number }) { } }
    
    class PlayerShoot { constructor() { } }
    
    class EnemyShoot { constructor() { } }
    
    class ResetGame { constructor() { } }

    type Event = 'keydown' | 'keyup' | 'mousemove' | 'mousedown';
    type Key = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'KeyX';

    /**
     * The most basic type of object used for the game - all others extend this. 
     * It has an id, coordinates, dimensions, and can move.
     */
    type GameObject = Readonly<{
        id: string,
        x: number,
        y: number,
        velX: number,
        velY: number,
        objectWidth: number,
        objectHeight: number,
    }>

    /**
     * Represents an Enemy.
     */
    interface IEnemy extends GameObject {
        col: number,
        row: number,
        canShoot: boolean
    }

    /**
     * Represent the Player.
     */
    interface IPlayer extends GameObject {
    }
   
    /**
     * Used to store all Enemies in the game.
     */
    interface IEnemyTracker extends GameObject {
        enemies: ReadonlyArray<Enemy>
    }

    /**
     * A small square that makes up the Shields.
     */
    interface ITile extends GameObject {
        col: number,
        row: number
    }

    /**
     * A Shield, made from a number of Tiles.
     */
    interface IShield extends GameObject {
        tiles: ReadonlyArray<Tile>
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

    /**
     * Determines if the user's mouse is over the svg canvas.
     * @param param0 a MouseEvent
     * @returns True if the mouse is on the canvas, False otherwise
     */
    const mouseOnCanvas = ({ clientX, clientY }: MouseEvent) =>
        clientX > canvasRect.left &&
        clientX < canvasRect.right &&
        clientY > canvasRect.top &&
        clientY < canvasRect.bottom;

    /**
     * Observable streams
     */
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

        enemyShootStream = interval(1500).pipe(map(() => new EnemyShoot())),

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
    const moveBullet = (b: Bullet) => <Bullet>{
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
        y: s.player.y - 1,
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

        /**
         * These are a number of consts and anonymous functions for updating collisions.
         * It is based off the general structure of the Observable Asteroids example.
         */
        const
            allBulletsAndPlayer = s.bullets.map(b => <[Bullet, Player]>[b, s.player]),
            
            allBulletsAndEnemies = s.bullets.flatMap(b => 
                s.enemyTracker.enemies.map(e => <[Bullet, Enemy]>[b, e])), 
            
            allBulletsAndTiles = s.bullets.flatMap(b => 
                s.shields.flatMap(s => s.tiles.map(t => <[Bullet, Tile]>[b, t]))),
            
            allEnemiesAndTiles = s.enemyTracker.enemies.flatMap(e => 
                s.shields.flatMap(s => s.tiles.map(t => <[Bullet, Tile]>[e, t]))),
            
            collidedBulletsEnemies = allBulletsAndEnemies.filter(objectCollision),
            
            collidedBulletsTiles = allBulletsAndTiles.filter(objectCollision),
            
            playerCollided = allBulletsAndPlayer.filter(objectCollision).length > 0 
                || s.enemyTracker.enemies.filter(e => e.y > 520).length > 0,

            collidedEnemiesTiles = allEnemiesAndTiles.filter(objectCollision),
            
            collidedEnemies = collidedBulletsEnemies.map(([_, enemy]) => enemy),
            
            collidedTiles = collidedBulletsTiles.map(([_, tile]) => tile)
                .concat(collidedEnemiesTiles.map(([_, tile]) => tile)),
            
            collidedBullets = collidedBulletsEnemies.map(([bullet, _]) => bullet)
                .concat(collidedBulletsTiles.map(([bullet, _]) => bullet)),
           
            // cut an array of Enemies from another
            cutEnemies = except((a: Enemy) => (b: Enemy) => a.id === b.id),
           
            // cut an array of Bullets from another
            cutBullets = except((a: Bullet) => (b: Bullet) => a.id === b.id),

            // cut an array of Tiles from another
            cutTiles = except((a: Tile) => (b: Tile) => a.id === b.id),

            // retrieve all Enemies in a given column
            enemiesInCol = (s: State, col: number) => s.enemyTracker.enemies.filter(e => e.col === col),

            // find the lower-positioned Enemy from two given Enemies
            lowerInCol = (e: Enemy, f: Enemy) => e.row > f.row ? e : f,

            // find the lowest-positioned enemy in a given column
            lowestInCol = (s: State, col: number) => enemiesInCol(s, col).reduce(lowerInCol),

            // check if there are no enemies left in the current state
            noEnemies = (s: State) => s.enemyTracker.enemies.length === 0;

        if (playerCollided) clearObjects(s);

        return playerCollided ?  // game over
            <State>{
                ...s,
                gameStatus: 1
            } : noEnemies(s) ?  // all enemies defeated - go up a level and create new enemies
            <State> {
                ...s,
                bullets: [],
                shields: s.shields.map(sh => <Shield>{
                    ...sh,
                    tiles: cutTiles(sh.tiles)(collidedTiles)
                }),
                exit: s.exit.concat(s.bullets),
                enemyTracker: {
                    ...s.enemyTracker,
                    x: Constants.ET_INITIAL_X,
                    y: Constants.ET_INITIAL_Y,
                    enemies: initEnemies(),
                },
                score: s.score + collidedEnemies.length * 10,
                level: s.level + 1
            } :  // game continuing - remove collided objects and add to exit array
            <State>{
                ...s,
                bullets: cutBullets(s.bullets)(collidedBullets),
                shields: s.shields.map(sh => <Shield>{
                    ...sh,
                    tiles: cutTiles(sh.tiles)(collidedTiles)
                }),
                exit: s.exit.concat(collidedBullets, collidedEnemies, collidedTiles),
                enemyTracker: {
                    ...s.enemyTracker,
                    x: s.enemyTracker.x,
                    y: s.enemyTracker.y,
                    enemies: cutEnemies(s.enemyTracker.enemies.map(e =>
                            e.row === lowestInCol(s, e.col).row ? <Enemy>{...e, canShoot: true } : e))(collidedEnemies),
                },
                score: s.score + collidedEnemies.length * 10,
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
            bullets: onCanvasBullets.map(moveBullet),  // only move bullets currently on-screen
            enemyTracker: moveEnemies(s.enemyTracker, elapsed),
            exit: offCanvasBullets,  // add off-screen bullets to exit
            pseudoRNG: s.pseudoRNG * (s.player.x + s.bullets.length) % 1111111  // dumb pseudo-random number generator
        });
    };

    /**
     * Takes in a state, and an instance of the classes returned by the Observable streams.
     * It then updates the state based on what class is passed through.
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
     * Subscription call - it first merges all observable streams into one, then it updates the state
     * by using reduceState with any Objects passed from the observable streams. Last, it renders
     * the updated state to the screen using updateView.
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
            filter(s => s.gameStatus != 1)  // only update view whilst game is status 0 (playing)
        )
        .subscribe(updateView);

    /**
     * Renders the current state to the svg canvas.
     * @param s the current State object.
     */
    function updateView(s: State) {
        document.getElementById('gameover')!.innerHTML = '';
        document.getElementById('score')!.innerHTML = `SCORE: ${String(s.score)}`;
        document.getElementById('level')!.innerHTML = `LEVEL: ${String(s.level)}`;

        // move the ship based on Player object's x and y.
        ship.setAttribute('transform', `translate(${s.player.x}, ${s.player.y})`);

        /**
         * Sets an Element's basic attributes to those of a given GameObject.
         * @param v an Element object.
         * @param g a GameObject.
         * @returns an Element.
         */
        const setObjAttributes = (v: Element, g: GameObject) => {
            v.setAttribute('id', g.id);
            v.setAttribute('width', String(g.objectWidth));
            v.setAttribute('height', String(g.objectHeight));
            return v;
        }

        /**
         * Sets an Element's positional attributes to those of a given GameObject.
         * @param v an Element object.
         * @param g a GameObject.
         * @returns an Element.
         */
        const setPosAttributes = (v: Element, g: GameObject) => {
            v.setAttribute('x', String(g.x));
            v.setAttribute('y', String(g.y));
            return v;
        }

        /**
         * Create a new Element for a given Bullet object to be rendered to the screen.
         * @returns an Element.
         */
        const createBulletView = (b: Bullet) => {
            const v = setObjAttributes(document.createElementNS(canvas.namespaceURI, 'rect')!, b); 
            v.setAttribute('fill', 'white');
            return v;
        }

        /**
         * Create a new Element for a given Enemy object to be rendered to the screen. 
         * @returns en Element.
         */
        const createEnemyView = (e: Enemy) => {
            const v = setObjAttributes(document.createElementNS(canvas.namespaceURI, 'image')!, e);
            v.setAttribute('href', 'assets/alien.png');
            return v;
        }

        /**
         * Create a new Element for a given Tile object to be rendered to the screen.
         * @returns an Element.
         */
        const createTileView = (t: Tile) => {
            const v = setObjAttributes(document.createElementNS(canvas.namespaceURI, 'rect')!, t);
            v.setAttribute('fill', 'pink');
            return v;
        }

        /**
         * For each Bullet:
         * - If we've already rendered it to the canvas, just update it's position
         * - If we havene't rendered it yet, create a new Element for it and then add it
         */
        s.bullets.forEach(b => {
            const v = document.getElementById(b.id) || createBulletView(b);
            setPosAttributes(v, b);
            canvas.appendChild(v);
        });

        /**
         * For each Enemy:
         * - If we've already rendered it to the canvas, just update it's position
         * - If we havene't rendered it yet, create a new Element for it and then add it
         */
        s.enemyTracker.enemies.forEach(e => {
            const v = document.getElementById(e!.id) || createEnemyView(e);
            setPosAttributes(v, e);
            canvas.appendChild(v);
        });

        /**
         * For each Tile:
         * - If we've already rendered it to the canvas, just update it's position
         * - If we havene't rendered it yet, create a new Element for it and then add it
         */
        s.shields.forEach(sh => sh.tiles.forEach(t => {
            const v = document.getElementById(t!.id) || createTileView(t);
            setPosAttributes(v, t);
            canvas.appendChild(v);
        }));

        // Remove anything in the exit array
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