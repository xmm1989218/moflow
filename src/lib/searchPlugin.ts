import { $prose } from "@milkdown/kit/utils";
import { search } from "prosemirror-search";

const searchProsePlugin = $prose(() => search());

export const searchPlugin = [searchProsePlugin].flat();
