/**
 * Used to easily parse variable-size frame data coming from sockets.  It allows a customizable frame
 * length reader if the default isn't acceptable (buf.readInt32BE()).
 *
 * To use it, set it as your 'data' event listener. When a full frame is found, the FrameBuffer
 * will emit a "frame" event which can be listened to to get the full frame without the frame size
 * header:
 *
 * var framing_buffer = new require('framing-buffer')();
 * framing_buffer.on('frame', function(frame) {
 *     // got my full frame!
 * });
 *
 * socket.on('data', function(data) {
 *     framing_buffer.push(data);
 * });
 *
 * The FramingBuffer keeps track of only one data stream.  Keep an instance of this per steam
 * that needs framing (i.e. one per socket / connection).
 */
module.exports = function(OffsetBuffer,
                          BufferGroup,
                          debug,
                          events,
                          util,
                          logger) {

    /**
     * The stats of the FSM to have.
     */
    var ST_PARSE   = 1, // Parsing incoming data.  No full frame found yet.
        ST_EXTRACT = 2; //

    /**
     * Ctor. The user can provide the following options (defaults shown):
     * {
     *      frame_length_size: 4;
     *      frame_length_reader: function(offset_buffer) {
     *          return offset_buffer.readInt32BE();
     *      }
     * }
     */
    function FramingBuffer(options) {

        /**
         * The length of the frame_length field in bytes.
         */
        this.frame_length_size = (options && options.frame_length_size) ?
            options.frame_length_size : 4;

        /**
         * The reader used to read the frame_length from the buffer.  It is
         * passed in an OffsetBuffer to read from.
         */
        this.frame_length_reader = (options && options.frame_length_reader) ?
            options.frame_length_reader : frame_length_reader;

        /**
         * Keeps track of the expected length of the currently processed
         * result frame.  We also use this as our FSM flag:
         *
         *   >0: we assume any data that arrives is part of the
         *       current_frame_buffer.
         *
         *    0: we assume that new data that arrives is the start of a
         *       new frame.
         */
        this.current_frame_length = 0;

        /**
         * Buffer of the current response data.  We'll need to do
         * our own framing of the stream to understand when one response
         * ends, and another begins. We'll buffer a response until a frame
         * ends before emitting a 'frame' event.
         */
        this.current_frame_buffer = new BufferGroup();

        events.EventEmitter.call(this);
    }
    util.inherits(FramingBuffer, events.EventEmitter);

    /**
     * Accepts data into the FramingBuffer. It uses a simple FSM to keep state for this data stream.
     * If two or more full frames are pushed in the same data_buffer, multiple emit 'frame' events are
     * possible.
     */
    FramingBuffer.prototype.push = function(data_buffer) {
        if (!data_buffer || data_buffer.length === 0) {
            return;
        }

        var frame_length = this.current_frame_length,
            frame_buffer = this.current_frame_buffer,
            frame_length_size = this.frame_length_size,
            state = ST_PARSE,
            full_frame,
            new_state;

        // First, buffer the data
        frame_buffer.push(data_buffer);
        while (state) {
            new_state = 0;
            // ST_PARSE phase where we ingest data and try to figure out where the
            // frame begins and ends.
            if (state === ST_PARSE) {
                if (frame_length  === 0) {
                    // If we don't know the length of the next phase, first thing
                    // is to buffer data until we have at least the data needed
                    // to read the frame size.
                    if (frame_buffer.length >= frame_length_size) {
                        frame_length = this.frame_length_reader(frame_buffer.extract(frame_length_size));
                        new_state = ST_EXTRACT;
                    }
                } else {
                    //  We have the length of the frame, so we can progress to
                    //  extracting the frame from the buffer.
                    new_state = ST_EXTRACT;
                }
            } else {
                if (frame_buffer.length >= frame_length) {
                    // We're in business!  We've got at least the data we need
                    // for a frame (any maybe more). Our BufferGroup will take
                    // care of the details of extracting just the bytes we need
                    // for this frame and keep the rest intact.
                    full_frame = frame_buffer.extract(frame_length);
                    // now we reset the frame state
                    frame_length = 0;
                    // and tell our listeners about the full frame.
                    this.emit('frame', full_frame);
                    full_frame = null;
                    // If there is any bytes left, try to read another frame length
                    // (and possibly) another full frame
                    new_state = ST_PARSE;
                }
            }
            state = new_state;
        }
        this.current_frame_length = frame_length;
    };

    // Default frame_length_reader
    function frame_length_reader(offset_buffer) {
        return offset_buffer.readInt32BE();
    }

    return FramingBuffer;
};
