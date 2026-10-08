import "server-only";
import { env } from "../env";
import { createMediaStore, type MediaStore } from "./store";

let store: MediaStore | undefined;
export const getMediaStore = () => (store ??= createMediaStore(env().MEDIA_DIR));
