import { createServer } from './createServer';
import { registerSocketHandlers } from './socket';

const { server, io } = createServer();

registerSocketHandlers(io);

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => console.log(`Server is running on ${PORT}`));
