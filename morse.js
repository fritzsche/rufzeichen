
const code_map = [
    [/<ka>/, '-.-.-'],  // Message begins / Start of work 
    [/<sk>/, '...-.-'], //  End of contact / End of work
    [/<ar>/, '.-.-.'],  // End of transmission / End of message
    [/<kn>/, '-.--.'], // Go ahead, specific named station.
    [/=/, '-...-'],
    [/a/, '.-'],
    [/b/, '-...'],
    [/c/, '-.-.'],
    [/d/, '-..'],
    [/e/, '.'],
    [/f/, '..-.'],
    [/g/, '--.'],
    [/h/, '....'],
    [/i/, '..'],
    [/j/, '.---'],
    [/k/, '-.-'],
    [/l/, '.-..'],
    [/m/, '--'],
    [/n/, '-.'],
    [/o/, '---'],
    [/p/, '.--.'],
    [/q/, '--.-'],
    [/r/, '.-.'],
    [/s/, '...'],
    [/t/, '-'],
    [/u/, '..-'],
    [/v/, '...-'],
    [/w/, '.--'],
    [/x/, '-..-'],
    [/y/, '-.--'],
    [/z/, '--..'],
    [/1/, '.----'],
    [/2/, '..---'],
    [/3/, '...--'],
    [/4/, '....-'],
    [/5/, '.....'],
    [/6/, '-....'],
    [/7/, '--...'],
    [/8/, '---..'],
    [/9/, '----.'],
    [/0/, '-----'],
    [/'/, '.-.-.-'],
    [/,/, '--..--'],
    [/\?/, '..--..'],
    [/'/, '.----.'],
    [/\//, '-..-.'],
    [/\s+/, ' '],  // whitespace is trimmed to single char
    [/./, '']  // ignore all unknown char
];


class Morse {
    constructor(ctx, wpm = 20, freq = 650, farnsworth = 999) {


        this._ctx = ctx;  // web audio context
        this._runId = 0;
        this._currPos = 0;
        this._state = 'INITIAL';

        this._wpm = Number(wpm);
        this._ditLen = this._ditLength(wpm * 5);
        this._farnsworth = Number(farnsworth);
        if (this._farnsworth > this._wpm) this._farnsworth = this._wpm;
        this._spaceDitLen = this._ditLength(this._farnsworth * 5);

        this.frequency = freq;

    }

    set wpm(w) {
        if (this._wpm === Number(w)) return;
        this._wpm = Number(w);
        this._ditLen = this._ditLength(this._wpm * 5);
        if (this._farnsworth > this._wpm) this._farnsworth = this._wpm;
        this._spaceDitLen = this._ditLength(this._farnsworth * 5);        
        if (this._state !== 'INITIAL') {
            this._seqence = this._seqenceEvents(this._conv_to_morse(this._text));
            this._startTime = this._ctx.currentTime - this._seqence[this._currPos].time;
        }
    }

    set farnsworth(f) {
        if (this._farnsworth === f) return;
        this._farnsworth = Number(f);
        if (this._farnsworth > this._wpm) this._farnsworth = this._wpm;
        this._spaceDitLen = this._ditLength(this._farnsworth * 5);
        // need to recalc sequence
        if (this._state !== 'INITIAL') {
            this._seqence = this._seqenceEvents(this._conv_to_morse(this._text));
            this.startTime = this._ctx.currentTime - this._seqence[this._currPos].time;
        }
    }


    /**
     * @param {string} txt
     */
    set text(txt) {
        if (this._text === txt) return;
        this._text = txt;
        this._currPos = 0;
        this._seqence = this._seqenceEvents(this._conv_to_morse(txt));
    }

    set displayCallback(callback) {
        this._displayCallback = callback;
    }


    set frequency(freq = 650) {
        this._freq = freq;
        this._ditBuffer = this._createBuffer(this._ditLen);
        this._dahBuffer = this._createBuffer(this._ditLen * 3);
    }


    get state() {
        return this._state;
    }

    start() {
        if (audioCtx.state !== 'running') {
            audioCtx.resume().then(() => this._morsePlay());
        } else this._morsePlay();
    }
    stop() {
        this._runId++;
        this._state = 'STOPPED';
    }
    // https://github.com/cwilso/metronome/
    // https://www.html5rocks.com/en/tutorials/audio/scheduling/
    _morsePlay() {
        switch (this._state) {
            case 'INITIAL': this._startTime = this._ctx.currentTime;
                break;
            case 'STOPPED':
                this._startTime = this._ctx.currentTime - this._seqence[this._currPos].time;
                break;
            case 'ENDED':
                this._currPos = 0;
                this._startTime = this._ctx.currentTime;
                break;
        }
        this._state = 'STARTED';
        // start time of the current player sequence
        let ahead = this._ditLen * 4;  // number of time we look ahead for new events to play
        this._runId++;
        let currRun = this._runId;
        let scheduled = () => {
            if (currRun !== this._runId) return;
            let current = this._ctx.currentTime;
            let delta = current - this._startTime;
            for (; ;) {
                if (this._currPos >= this._seqence.length) {
                    this._state = 'ENDED';
                    this._currPos = 0;
                    break; // exit look if current position reach end
                }
                let ev = this._seqence[this._currPos]; // pick current event
                if (ev.time < delta + ahead) {  // check the event is part of current lookahead
                    this._currPos++;
                    switch (ev.action) {
                        case 'PLAY': {
                            switch (ev.tone) {
                                case '.': {
                                    this._playBuffer(this._ditBuffer, this._startTime + ev.time);
                                    break;
                                }
                                case '_': {
                                    this._playBuffer(this._dahBuffer, this._startTime + ev.time);
                                    break;
                                }
                            }
                            break;
                        }
                        case 'DISPLAY': {
                            let milis = (ev.time - (current - this._startTime)) * 1000;
                            setTimeout(() => {
                                if (this._displayCallback) this._displayCallback(ev);
                            }, milis);
                        }
                    }
                } else break;
            }
            if (this._state === 'STARTED') setTimeout(scheduled, (ahead * 1000) / 3);
        }
        scheduled();
    }

    _seqenceEvents(conv) {
        let seq = [];
        let current = 0;
        let currDits = 0;
        let currSpaceDits = 0;
        let currText = "";

        conv.forEach(letter => {
            switch (letter.pattern) {
                case ' ':
                    currText += ' ';
                    seq.push({ time: current, dits: currDits, spaces: currSpaceDits, action: 'DISPLAY', value: ' ', text: currText });
                    current += this._spaceDitLen * 7;
                    currSpaceDits += 7;
                    break;
                case '*':
                    current += this._spaceDitLen * 3;
                    currSpaceDits += 3;
                    break;
                default:
                    let word = letter.pattern.split("").join("*");
                    currText += letter.text;
                    seq.push({ time: current, dits: currDits, spaces: currSpaceDits, action: 'DISPLAY', value: letter.text, text: currText });
                    [...word].forEach(tone => {
                        currDits++;
                        switch (tone) {
                            case '.':
                                seq.push({ time: current, dits: currDits, spaces: currSpaceDits, action: 'PLAY', tone: '.' });
                                current += this._ditLen;
                                break;
                            case '-':
                                seq.push({ time: current, dits: currDits, spaces: currSpaceDits, action: 'PLAY', tone: '_' });
                                current += this._ditLen * 3;
                                currDits += 2;
                            case '*':
                                current += this._ditLen;
                                break;
                            default:
                                debugger;
                        }
                    });
                    break;
            }
        });
        return seq;
    }

    _createBuffer(len) {
        let rt = 50;
        let ft = 50;
        let myArrayBuffer = this._ctx.createBuffer(2, this._ctx.sampleRate * len, this._ctx.sampleRate);

        for (let channel = 0; channel < myArrayBuffer.numberOfChannels; channel++) {
            // This gives us the actual ArrayBuffer that contains the data
            let nowBuffering = myArrayBuffer.getChannelData(channel);
            for (let i = 0; i < myArrayBuffer.length; i++) {
                nowBuffering[i] = Math.sin(2 * Math.PI * this._freq * i / this._ctx.sampleRate);
                if (i < rt) {
                    nowBuffering[i] *= Math.pow(Math.sin(Math.PI * i / (2 * rt)), 2);
                }
                if (i > myArrayBuffer.length - ft) {
                    nowBuffering[i] *= Math.pow((Math.sin(2 * Math.PI * (i - (myArrayBuffer.length - ft) + ft) / (4 * ft))), 2);
                }
            }
        }
        return myArrayBuffer;
    }
    _playBuffer(buf, start = 0) {
        let source = this._ctx.createBufferSource();
        source.buffer = buf;
        source.connect(this._ctx.destination);
        source.start(start);
    }
    _conv_to_morse(str) {
        let low_str = str.toLowerCase();
        let offset = 0;
        let last_is_char = false;
        var result = [];
        for (; ;) {
            let length = 0;
            let pattern = "";
            for (let i = 0; i < code_map.length; i++) {
                let reg = code_map[i][0];
                let found = low_str.substr(offset).match(reg);
                if (found && found.index == 0) {
                    pattern = code_map[i][1];
                    length = found[0].length;
                    break;
                }
            }
            if (pattern != '') {
                if (pattern == ' ') {
                    result.push({ pattern: pattern })
                    last_is_char = false;
                }
                else {
                    if (last_is_char) result.push({ pattern: '*' });
                    result.push({ pattern: pattern, offset: offset, length: length, text: low_str.substr(offset, length) });
                    last_is_char = true;
                }
            }
            offset += length;
            if (offset === low_str.length) break;
        }
        return (result);
    }

    _ditLength(cpm) {
        // The standard word "PARIS" has 50 units of time. 
        // .--.  .-  .-.  ..  ... ==> "PARIS"
        // 10 dit + 4 dah + 9 dit space + 4 dah space = 19 dit + 24 dit = 43 dit.
        // 43 dit + 7 dit between words results in 50 dits total time
        //
        // 100cpm (character per minute) 
        // means we need to give 20 times to word "PARIS".
        // means we give 20 times 50 units of time = 1000 units of time per minute (or 60 seconds).
        // 60 seconds devided by 1000 unit of time, means each unit (dit) takes 60ms.
        // Means at  speed of 100 cpm  a dit has 60ms length
        // length of one dit in s = ( 60ms * 100 ) / 1000        
        const cpmDitSpeed = (60 * 100) / 1000;
        return cpmDitSpeed / cpm;
    }
}
let audioCtx = new (window.AudioContext || window.webkitAudioContext)();


String.prototype.levenstein = function (string) {
    var a = this, b = string + "", m = [], i, j, min = Math.min;

    if (!(a && b)) return (b || a).length;

    for (i = 0; i <= b.length; m[i] = [i++]);
    for (j = 0; j <= a.length; m[0][j] = j++);

    for (i = 1; i <= b.length; i++) {
        for (j = 1; j <= a.length; j++) {
            m[i][j] = b.charAt(i - 1) == a.charAt(j - 1)
                ? m[i - 1][j - 1]
                : m[i][j] = min(
                    m[i - 1][j - 1] + 1,
                    min(m[i][j - 1] + 1, m[i - 1][j] + 1))
        }
    }
    return m;
}



const min_edit = (a, b) => {
    let D = b.levenstein(a);

    const combine = (a, e) => {
        if (a.length == 0) return [e];
        let last = a[a.length - 1];
        if (last.op == e.op) {
            last.s += e.s;
            if (last.op == 'UPD') {
                last.s2 += e.s2;
            }
            a[a.length - 1] = last;
            return a;
        } else {
            return a.concat([e]);
        }

    }

    const backtrace = (i, j) => {
        if (i > 0 && D[i - 1][j] + 1 == D[i][j]) return combine(backtrace(i - 1, j), { op: 'DEL', s: a.charAt(i - 1) });
        if (j > 0 && D[i][j - 1] + 1 == D[i][j]) return combine(backtrace(i, j - 1), { op: 'INS', s: b.charAt(j - 1) });
        if (i > 0 && j > 0 && D[i - 1][j - 1] + 1 == D[i][j]) return combine(backtrace(i - 1, j - 1), { op: 'UPD', s:   b.charAt(j - 1), s2: a.charAt(i - 1)  });
        if (i > 0 && j > 0 && D[i - 1][j - 1] == D[i][j]) return combine(backtrace(i - 1, j - 1), { op: 'EQ', s: a.charAt(i - 1) });
        return [];
    }
    return (backtrace(a.length, b.length));
}


// durty global variable
let wpm = document.getElementById("wpm").value;
let fw = document.getElementById("fw").value;
let m = new Morse(audioCtx, wpm, freq, fw);
let calls = [];

var index = -1;

const out = document.getElementById("out");

function morse() {
    if (calls.length == 0) return;
    if (index == -1) {
        morse_new();
        return;
    }     
    let freq = document.getElementById("freq").value;
    //    let morseTxt = document.getElementById("txt").value;
    let wpm = document.getElementById("wpm").value;
    let fw = document.getElementById("fw").value;
    m.text = calls[index];
    m.frequency = freq;
    m.wpm = wpm;
    m.farnsworth = fw;
    m.start();
}

function morse_new() {
    document.getElementById("txt").value = '';
    document.getElementById("txt").focus();
    // play sound with 1s delay   
    setTimeout(() => {
        index = Math.floor(Math.random() * calls.length);
        morse();
    }, 1000);
}

function loadCalls() {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function () {

        if (this.readyState == 4 && this.status == 200) {
            calls = this.responseText.split("\n").filter(x => x.length > 3 && x.length <= 6);

            document.getElementById("txt").onkeyup = e => {
                let position = e.target.selectionStart
                var str = e.target.value;
                e.target.value = str.toUpperCase();

                if (e.key === 'Enter' || e.keyCode === 13 && e.target.value !== '') {
                    if (index != -1) {
                        let m = min_edit(e.target.value, calls[index]);
                        let n = m.reduce((prevVal, currVal, idx) => {
                            var r = prevVal;
                            r += `<span class="${currVal.op}">${currVal.s}</span>`;
                            if (currVal.op == 'UPD') r += `<span class="DEL">${currVal.s2}</span>`;
                            return r;
                        }, '')

                        out.innerHTML += n + ' ';
                        //`<span class="${calls[index] == e.target.value ? 'ok' : 'error'}">(${calls[index]} / ${e.target.value})</span> `;
                        out.scrollTop = out.scrollHeight;
                    }


                    morse_new();
                    e.preventDefault();
                }
                if (e.key === 'Space' || e.keyCode === 32) {
                    morse();
                    e.target.value = e.target.value.split(' ').join('');
                    position--;
                }
                e.target.selectionEnd = position;
            };
            document.getElementById("txt").focus();
        }
    };
    xhttp.open("GET", "calls.txt", true);
    xhttp.send();
}
loadCalls();




