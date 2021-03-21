import React from "react";
import { PageHeader } from "antd";

// displays a page header

export default function Header() {
  return (
    <a href="#" target="_blank" rel="noopener noreferrer">
      <PageHeader title="🐮 Cashcow" style={{ cursor: "pointer" }} />
    </a>
  );
}
