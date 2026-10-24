using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public class Builder
{
    public static void Main()
    {
        string dir = Path.GetDirectoryName(typeof(Builder).Assembly.Location);
        string icoPath = Path.Combine(dir, "app.ico");
        GenerateIcon(icoPath);
        Console.WriteLine("Icon generated: " + icoPath);
    }

    private static void GenerateIcon(string icoPath)
    {
        int size = 256;
        using (Bitmap bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb))
        {
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.Clear(Color.Transparent);

                // Rounded squircle bounds
                int pad = 14;
                int r = 52;
                Rectangle rect = new Rectangle(pad, pad, size - pad * 2, size - pad * 2);
                using (GraphicsPath path = GetRoundedRect(rect, r))
                {
                    // Rich deep gradient background
                    using (LinearGradientBrush bgBrush = new LinearGradientBrush(
                        rect, Color.FromArgb(17, 24, 39), Color.FromArgb(3, 7, 18), 55f))
                    {
                        g.FillPath(bgBrush, path);
                    }

                    // Neon cyan border
                    using (Pen borderPen = new Pen(Color.FromArgb(56, 189, 248), 7f))
                    {
                        g.DrawPath(borderPen, path);
                    }
                }

                // Inner prompt text: ">_"
                using (Font font = new Font("Consolas", 96f, FontStyle.Bold, GraphicsUnit.Pixel))
                {
                    using (Brush textBrush = new SolidBrush(Color.FromArgb(16, 185, 129))) // Emerald neon
                    {
                        StringFormat sf = new StringFormat
                        {
                            Alignment = StringAlignment.Center,
                            LineAlignment = StringAlignment.Center
                        };
                        g.DrawString(">_", font, textBrush, new RectangleF(0, -4, size, size), sf);
                    }
                }
            }

            using (FileStream fs = new FileStream(icoPath, FileMode.Create))
            {
                SavePngAsIco(bmp, fs);
            }
        }
    }

    private static GraphicsPath GetRoundedRect(Rectangle bounds, int radius)
    {
        int diameter = radius * 2;
        Size size = new Size(diameter, diameter);
        Rectangle arc = new Rectangle(bounds.Location, size);
        GraphicsPath path = new GraphicsPath();

        path.AddArc(arc, 180, 90);
        arc.X = bounds.Right - diameter;
        path.AddArc(arc, 270, 90);
        arc.Y = bounds.Bottom - diameter;
        path.AddArc(arc, 0, 90);
        arc.X = bounds.Left;
        path.AddArc(arc, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static void SavePngAsIco(Bitmap bmp, Stream output)
    {
        byte[] pngBytes;
        using (MemoryStream ms = new MemoryStream())
        {
            bmp.Save(ms, ImageFormat.Png);
            pngBytes = ms.ToArray();
        }

        using (BinaryWriter bw = new BinaryWriter(output))
        {
            bw.Write((short)0); // reserved
            bw.Write((short)1); // icon type
            bw.Write((short)1); // 1 image

            bw.Write((byte)0);  // width (0 = 256)
            bw.Write((byte)0);  // height (0 = 256)
            bw.Write((byte)0);  // color palette
            bw.Write((byte)0);  // reserved
            bw.Write((short)1); // color planes
            bw.Write((short)32);// bits per pixel
            bw.Write((int)pngBytes.Length); // size of image
            bw.Write((int)22);  // offset (6 + 16)

            bw.Write(pngBytes);
        }
    }
}
