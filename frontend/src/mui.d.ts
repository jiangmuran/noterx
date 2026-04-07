/**
 * MUI v6 类型扩展：允许 Typography、Stack 等组件直接使用 system props。
 * 这些 props 在运行时有效，但 TS 默认类型不包含。
 */
import "@mui/material/Typography";
import "@mui/material/Stack";

declare module "@mui/material/Typography" {
  interface TypographyOwnProps {
    fontWeight?: number | string;
    fontSize?: number | string;
    textAlign?: string;
    lineHeight?: number | string;
    display?: string;
  }
}

declare module "@mui/material/Stack" {
  interface StackOwnProps {
    justifyContent?: string;
    alignItems?: string;
    flexWrap?: string;
  }
}
