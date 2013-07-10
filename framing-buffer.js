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
         * ends before resolving the promise from the write().
         */
        this.current_frame_buffer = new BufferGroup();

        events.EventEmitter.call(this);
    }
    util.inherits(FramingBuffer, events.EventEmitter);

    /**
     * Accepts data into the FramingBuffer. It uses a simple FSM to keep state for this data stream.
     * Two or more full frames are pushed in the same data_buffer, multiple emit 'frame' events are
     * possible.
     */
    FramingBuffer.prototype.push = function(data_buffer) {
        var self = this,
            frame_length = this.current_frame_length,
            frame_buffer = this.current_frame_buffer;

        function check_and_extract_frame() {
            var full_frame;
            if (frame_buffer.length >= frame_length) {
                // we're in business!  We've got at least the data we need
                // for a frame (any maybe more). Our BufferGroup will take
                // care of the details of extracting just the bytes we need
                // for this frame and keep the rest intact.
                full_frame = frame_buffer.extract(frame_length);
                // now we reset the frame state
                frame_length = self.current_frame_length = 0;
                // and tell our listeners about the full frame
                self.emit('frame', full_frame);
                // if there is any bytes left, try to read it's frame length
                // so we can possibly read another full frame
                parse();
            }
        }

        function parse() {
            //  If current_frame_length === 0 we're expecting a new frame...
            //      If have enough data in the buffer to get the frame size?
            //          Extract it from the buffer so it only contains
            //          the frame data.  If the data also includes the
            //          whole frame, we can go ahead and emit
            //          the result, then reset the current_frame_length
            //          instead of waiting for another data event.
            //      If there isn't enough data for the key, keep buffering
            //  If current_frame_length > 0 we're in the middle of a frame...
            //      If we have enough data to parse the frame?
            //          Do it, reset the state (current_frame_length,
            //          current_frame_buffer).  If there is any data left
            //          over, start at the top...
            if (frame_length  === 0) {
                if (frame_buffer.length >= self.frame_length_size) {
                    // TODO: there are some performance improvements we can make here on the occasion
                    // TODO: that the full frame length and full frame data is passed in at once.
                    frame_length = self.current_frame_length =
                        self.frame_length_reader(frame_buffer.extract(self.frame_length_size));
                    check_and_extract_frame();
                }
            } else {
                check_and_extract_frame();
            }
        }

        if (data_buffer && data_buffer.length > 0) {
            // First, buffer the data
            frame_buffer.push(data_buffer);
            parse();
        }
    };

    // Default frame_length_reader
    function frame_length_reader(offset_buffer) {
        return offset_buffer.readInt32BE();
    }

    return FramingBuffer;
};