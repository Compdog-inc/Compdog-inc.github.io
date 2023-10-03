const Connect = async function (callbackDown, callbackUp) {
  if ("serial" in navigator) {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });

    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        reader.releaseLock();
        break;
      }
      if (value.trim() === "a") {
        callbackDown();
      }
      if (value.trim() === "b" && typeof callbackUp !== "undefined") {
        callbackUp();
      }
    }
  }
};
