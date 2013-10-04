{
    gsub(/\//, "\\", $6)
    if ($5 == "M") {
        print "sd edit " $6;
        print "xcopy C:\\my\\dev\\" $6 " " $6;
    } else if ($5 == "A") {
        print "xcopy C:\\my\\dev\\" $6 " " $6;
        print "sd add " $6;
    } else if ($5 == "D") {
        print "sd delete " $6;
    }
}