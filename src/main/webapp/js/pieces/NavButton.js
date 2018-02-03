define([], function NavButton() {

	function NavButton(index, nav) {

		return new Binding({

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
