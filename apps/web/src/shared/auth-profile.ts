import { z } from "zod";

export const displayNameSchema = z.string().trim().min(1, "표시 이름을 입력해 주세요.").max(40, "표시 이름은 40자 이하로 입력해 주세요.");
