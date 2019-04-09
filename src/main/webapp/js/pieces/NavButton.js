define(["./Library"], function NavButton(Library) {

	function NavButton(index, nav) {

		return new Library.Binding({

			click: function() {

				nav.showPage(index);
			},
			classes: {

				active: function() {

					return index == nav.getCurrentIndex();
				}
			}
		});
	}

	return NavButton;
});
